import type { AnalysisHistoryEntry } from "@/lib/anomaly-detection";
import type { IssueGroup } from "@/lib/log-parser";

export type TrendGranularity = "day" | "week";

export interface TrendPoint {
  key: string;
  label: string;
  errors: number;
  warnings: number;
  issues: number;
  entry: AnalysisHistoryEntry;
}

export interface ComponentTrend {
  name: string;
  count: number;
  share: number;
}

export interface GrowingIssue {
  fingerprint: string;
  title: string;
  component: string;
  category: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  growthPercent: number | null;
  issue: IssueGroup;
}

export interface TrendSummary {
  points: TrendPoint[];
  components: ComponentTrend[];
  growingIssues: GrowingIssue[];
  recurringRate: number;
  recurringIssues: number;
  uniqueIssues: number;
  latestErrors: number;
  errorChangePercent: number | null;
}

export function buildTrendSummary(history: AnalysisHistoryEntry[], granularity: TrendGranularity): TrendSummary {
  const points = createTrendPoints(history, granularity);
  const latest = points.at(-1)?.entry;
  const previous = points.at(-2)?.entry;
  const components = createComponentBreakdown(latest);
  const growingIssues = createGrowingIssues(latest, previous);
  const recurrence = calculateRecurrence(points);
  const latestErrors = points.at(-1)?.errors || 0;
  const previousErrors = points.at(-2)?.errors || 0;

  return {
    points,
    components,
    growingIssues,
    recurringRate: recurrence.rate,
    recurringIssues: recurrence.recurring,
    uniqueIssues: recurrence.unique,
    latestErrors,
    errorChangePercent: previousErrors ? ((latestErrors - previousErrors) / previousErrors) * 100 : null,
  };
}

export function filterHistoryByDays(history: AnalysisHistoryEntry[], days: number | "all") {
  if (days === "all" || !history.length) return history;
  const latest = Math.max(...history.map((entry) => new Date(entry.createdAt).getTime()));
  const start = latest - days * 24 * 60 * 60_000;
  return history.filter((entry) => new Date(entry.createdAt).getTime() >= start);
}

function createTrendPoints(history: AnalysisHistoryEntry[], granularity: TrendGranularity) {
  const latestByBucket = new Map<string, AnalysisHistoryEntry>();
  for (const entry of history) {
    const key = bucketKey(new Date(entry.createdAt), granularity);
    const existing = latestByBucket.get(key);
    if (!existing || new Date(entry.createdAt) > new Date(existing.createdAt)) latestByBucket.set(key, entry);
  }
  return [...latestByBucket.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => ({
    key,
    label: bucketLabel(new Date(entry.createdAt), granularity),
    errors: entry.result.levelCounts?.E || 0,
    warnings: (entry.result.levelCounts?.W || 0) + (entry.result.levelCounts?.A || 0),
    issues: entry.result.issues?.length || 0,
    entry,
  }));
}

function createComponentBreakdown(entry?: AnalysisHistoryEntry) {
  const rows = entry?.result.componentErrors || [];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.slice(0, 8).map((row) => ({ ...row, share: total ? row.count / total * 100 : 0 }));
}

function createGrowingIssues(latest?: AnalysisHistoryEntry, previous?: AnalysisHistoryEntry) {
  if (!latest) return [];
  const previousCounts = new Map((previous?.result.issues || []).map((issue) => [issue.fingerprint, issue.count]));
  return (latest.result.issues || []).map((issue) => {
    const previousCount = previousCounts.get(issue.fingerprint) || 0;
    const delta = issue.count - previousCount;
    return {
      fingerprint: issue.fingerprint, title: issue.title, component: issue.component, category: issue.category,
      currentCount: issue.count, previousCount, delta,
      growthPercent: previousCount ? delta / previousCount * 100 : null,
      issue,
    };
  }).filter((issue) => issue.delta > 0).sort((a, b) => b.delta - a.delta || (b.growthPercent || 0) - (a.growthPercent || 0)).slice(0, 12);
}

function calculateRecurrence(points: TrendPoint[]) {
  const appearances = new Map<string, number>();
  for (const point of points) {
    for (const fingerprint of new Set((point.entry.result.issues || []).map((issue) => issue.fingerprint))) {
      appearances.set(fingerprint, (appearances.get(fingerprint) || 0) + 1);
    }
  }
  const unique = appearances.size;
  const recurring = [...appearances.values()].filter((count) => count >= 2).length;
  return { unique, recurring, rate: unique ? recurring / unique * 100 : 0 };
}

function bucketKey(date: Date, granularity: TrendGranularity) {
  if (granularity === "day") return localDateKey(date);
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return localDateKey(monday);
}

function bucketLabel(date: Date, granularity: TrendGranularity) {
  if (granularity === "day") return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date);
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return `Tuần ${new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(monday)}`;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
