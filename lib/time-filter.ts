import type { AnalysisResult, IssueGroup, TimeBucket } from "@/lib/log-parser";

export const TIME_PRESETS = [
  { value: "15", label: "15 phút" },
  { value: "30", label: "30 phút" },
  { value: "60", label: "1 giờ" },
  { value: "240", label: "4 giờ" },
  { value: "720", label: "12 giờ" },
  { value: "1440", label: "1 ngày" },
  { value: "4320", label: "3 ngày" },
  { value: "all", label: "Tất cả" },
] as const;

export type TimePreset = typeof TIME_PRESETS[number]["value"];

export function filterAnalysisByPreset(result: AnalysisResult, preset: TimePreset): AnalysisResult {
  if (preset === "all" || !result.lastSeen || !result.timeBuckets?.length) return result;
  const end = new Date(result.lastSeen);
  const start = new Date(end.getTime() - Number(preset) * 60_000);
  return filterAnalysisByRange(result, start, end);
}

export function filterAnalysisByRange(result: AnalysisResult, start: Date, end: Date): AnalysisResult {
  const buckets = (result.timeBuckets || []).map(restoreBucket).filter((bucket) => {
    const time = bucket.startTime.getTime();
    return time >= start.getTime() && time <= end.getTime();
  });
  if (!buckets.length) return emptyResult(result, start, end);

  const levelCounts: Record<string, number> = {};
  const componentCounts: Record<string, number> = {};
  const issueCounts: Record<string, number> = {};
  for (const bucket of buckets) {
    mergeCounts(levelCounts, bucket.levelCounts);
    mergeCounts(componentCounts, bucket.componentErrors);
    mergeCounts(issueCounts, bucket.issueCounts);
  }

  const issueLookup = new Map(result.issues.map((issue) => [issue.fingerprint, issue]));
  const issues = Object.entries(issueCounts).flatMap(([fingerprint, count]) => {
    const source = issueLookup.get(fingerprint);
    if (!source) return [];
    const occurrences = source.occurrences.filter((event) => {
      const timestamp = new Date(event.timestamp).getTime();
      return timestamp >= start.getTime() && timestamp <= end.getTime();
    });
    const firstSeen = occurrences[0]?.timestamp || buckets[0].startTime;
    const lastSeen = occurrences.at(-1)?.timestamp || buckets.at(-1)!.startTime;
    return [{ ...source, count, occurrences, firstSeen: new Date(firstSeen), lastSeen: new Date(lastSeen), priority: priorityFor(source, count) }];
  }).sort((a, b) => b.count - a.count);

  return {
    ...result,
    totalLines: sumBuckets(buckets, "totalEvents"),
    parsedLines: sumBuckets(buckets, "totalEvents"),
    levelCounts,
    componentErrors: Object.entries(componentCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    issues,
    timeline: buckets.map((bucket) => ({
      time: formatBucketTime(bucket.startTime, start, end),
      errors: bucket.levelCounts.E || 0,
      warnings: bucket.levelCounts.W || 0,
      alerts: bucket.levelCounts.A || 0,
    })),
    timeBuckets: buckets,
    firstSeen: start,
    lastSeen: end,
  };
}

export function restoreTimeBuckets(buckets: TimeBucket[] | undefined) {
  return (buckets || []).map(restoreBucket);
}

function restoreBucket(bucket: TimeBucket): TimeBucket {
  return { ...bucket, startTime: new Date(bucket.startTime) };
}

function emptyResult(result: AnalysisResult, start: Date, end: Date): AnalysisResult {
  return { ...result, totalLines: 0, parsedLines: 0, levelCounts: {}, componentErrors: [], issues: [], timeline: [], timeBuckets: [], firstSeen: start, lastSeen: end };
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] || 0) + value;
}

function sumBuckets(buckets: TimeBucket[], key: "totalEvents") {
  return buckets.reduce((sum, bucket) => sum + bucket[key], 0);
}

function priorityFor(issue: IssueGroup, count: number): IssueGroup["priority"] {
  if ((issue.level === "E" && count >= 100) || (issue.category === "License" && count >= 20)) return "Critical";
  if (issue.level === "E" || count >= 50) return "High";
  if (issue.level === "A" || issue.level === "W") return "Medium";
  return "Low";
}

function formatBucketTime(time: Date, start: Date, end: Date) {
  const includeDate = end.getTime() - start.getTime() > 24 * 60 * 60_000;
  return new Intl.DateTimeFormat("vi-VN", includeDate
    ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" }).format(time);
}
