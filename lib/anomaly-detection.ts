import type { AnalysisResult, IssueGroup } from "@/lib/log-parser";

export interface AnalysisHistoryEntry {
  id: string;
  name: string;
  createdAt: string;
  result: Partial<AnalysisResult>;
}

export type AnomalyStatus = "NEW" | "SPIKE" | "RECURRING" | "NORMAL";

export interface AnomalyRow {
  fingerprint: string;
  title: string;
  category: string;
  component: string;
  priority: IssueGroup["priority"];
  currentCount: number;
  baselineMean: number;
  changePercent: number | null;
  zScore: number;
  status: AnomalyStatus;
}

export function detectAnomalies(current: AnalysisHistoryEntry, baseline: AnalysisHistoryEntry[]): AnomalyRow[] {
  const currentIssues = current.result.issues || [];
  const sessionMaps = baseline.map((entry) => new Map((entry.result.issues || []).map((issue) => [issue.fingerprint, issue.count])));

  return currentIssues.map((issue) => {
    const samples = sessionMaps.map((session) => session.get(issue.fingerprint) || 0);
    const nonZeroSamples = samples.filter(Boolean);
    const mean = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : 0;
    const variance = samples.length ? samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length : 0;
    const deviation = Math.max(1, Math.sqrt(variance), Math.sqrt(mean));
    const zScore = (issue.count - mean) / deviation;
    const wasInLatestBaseline = samples[0] > 0;

    let status: AnomalyStatus = "NORMAL";
    if (!nonZeroSamples.length && issue.count >= 2) status = "NEW";
    else if (mean > 0 && issue.count >= Math.max(5, mean * 2) && zScore >= 2) status = "SPIKE";
    else if (!wasInLatestBaseline && nonZeroSamples.length) status = "RECURRING";

    return {
      fingerprint: issue.fingerprint,
      title: issue.title,
      category: issue.category,
      component: issue.component,
      priority: issue.priority,
      currentCount: issue.count,
      baselineMean: mean,
      changePercent: mean ? ((issue.count - mean) / mean) * 100 : null,
      zScore,
      status,
    };
  }).sort((a, b) => anomalyRank(b.status) - anomalyRank(a.status) || b.zScore - a.zScore || b.currentCount - a.currentCount);
}

export function createSessionTrend(entries: AnalysisHistoryEntry[]) {
  return [...entries].reverse().map((entry) => ({
    name: shortName(entry.name),
    createdAt: entry.createdAt,
    errors: entry.result.levelCounts?.E || 0,
    issues: entry.result.issues?.length || 0,
  }));
}

function anomalyRank(status: AnomalyStatus) {
  return { NEW: 4, SPIKE: 3, RECURRING: 2, NORMAL: 1 }[status];
}

function shortName(name: string) {
  return name.length > 22 ? `${name.slice(0, 19)}...` : name;
}
