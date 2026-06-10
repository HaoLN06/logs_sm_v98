import type { TimeBucket } from "@/lib/log-parser";

export const BUCKET_INTERVALS = [
  { value: "5m", label: "5 phút", minutes: 5 },
  { value: "15m", label: "15 phút", minutes: 15 },
  { value: "30m", label: "30 phút", minutes: 30 },
  { value: "1h", label: "1 giờ", minutes: 60 },
  { value: "4h", label: "4 giờ", minutes: 240 },
  { value: "1d", label: "1 ngày", minutes: 1440 },
] as const;

export type BucketInterval = typeof BUCKET_INTERVALS[number]["value"];

export interface AggregatedTimeBucket extends TimeBucket {
  endTime: Date;
}

export function isBucketInterval(value: string | null): value is BucketInterval {
  return BUCKET_INTERVALS.some((interval) => interval.value === value);
}

export function aggregateTimeBuckets(
  source: TimeBucket[] | undefined,
  interval: BucketInterval,
  from?: Date,
  to?: Date,
): AggregatedTimeBucket[] {
  const intervalMinutes = BUCKET_INTERVALS.find((item) => item.value === interval)!.minutes;
  const intervalMs = intervalMinutes * 60_000;
  const buckets = new Map<number, AggregatedTimeBucket>();

  for (const rawBucket of source || []) {
    const sourceTime = new Date(rawBucket.startTime);
    const timestamp = sourceTime.getTime();
    if (!Number.isFinite(timestamp)) continue;
    if (from && timestamp < from.getTime()) continue;
    if (to && timestamp > to.getTime()) continue;

    const startTime = floorToInterval(sourceTime, intervalMinutes);
    const key = startTime.getTime();
    const target = buckets.get(key) || {
      startTime,
      endTime: new Date(key + intervalMs),
      totalEvents: 0,
      levelCounts: {},
      componentErrors: {},
      issueCounts: {},
    };
    target.totalEvents += rawBucket.totalEvents || 0;
    mergeCounts(target.levelCounts, rawBucket.levelCounts);
    mergeCounts(target.componentErrors, rawBucket.componentErrors);
    mergeCounts(target.issueCounts, rawBucket.issueCounts);
    buckets.set(key, target);
  }

  return [...buckets.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

export function bucketTimeline(source: TimeBucket[] | undefined, interval: BucketInterval) {
  const buckets = aggregateTimeBuckets(source, interval);
  const includeDate = buckets.length > 1 && buckets.at(-1)!.startTime.getTime() - buckets[0].startTime.getTime() >= 24 * 60 * 60_000;
  const formatter = new Intl.DateTimeFormat("vi-VN", includeDate
    ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { hour: "2-digit", minute: "2-digit" });

  return buckets.map((bucket) => ({
    time: formatter.format(bucket.startTime),
    startTime: bucket.startTime.toISOString(),
    endTime: bucket.endTime.toISOString(),
    totalEvents: bucket.totalEvents,
    errors: bucket.levelCounts.E || 0,
    warnings: bucket.levelCounts.W || 0,
    alerts: bucket.levelCounts.A || 0,
  }));
}

function floorToInterval(date: Date, intervalMinutes: number) {
  if (intervalMinutes === 1440) return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const result = new Date(date);
  if (intervalMinutes > 60) {
    result.setHours(Math.floor(result.getHours() / (intervalMinutes / 60)) * (intervalMinutes / 60), 0, 0, 0);
    return result;
  }
  result.setMinutes(Math.floor(result.getMinutes() / intervalMinutes) * intervalMinutes, 0, 0);
  return result;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number> | undefined) {
  for (const [key, value] of Object.entries(source || {})) target[key] = (target[key] || 0) + value;
}
