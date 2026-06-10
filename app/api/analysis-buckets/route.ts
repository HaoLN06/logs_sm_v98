import { NextRequest, NextResponse } from "next/server";
import type { AnalysisResult, TimeBucket } from "@/lib/log-parser";
import { listHistory } from "@/lib/analysis-history";
import { aggregateTimeBuckets, isBucketInterval } from "@/lib/time-buckets";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const intervalValue = request.nextUrl.searchParams.get("interval") || "15m";
  const runId = request.nextUrl.searchParams.get("runId");
  const from = parseDate(request.nextUrl.searchParams.get("from"));
  const to = parseDate(request.nextUrl.searchParams.get("to"));

  if (!isBucketInterval(intervalValue)) {
    return NextResponse.json({ error: "Khoảng thời gian không hợp lệ." }, { status: 400 });
  }

  const history = await listHistory();
  const entries = runId ? history.filter((entry) => entry.id === runId) : history;
  const sourceBuckets = entries.flatMap((entry) => ((entry.result as Partial<AnalysisResult>).timeBuckets || []) as TimeBucket[]);
  const buckets = aggregateTimeBuckets(sourceBuckets, intervalValue, from, to);

  return NextResponse.json({
    interval: intervalValue,
    runCount: entries.length,
    buckets,
  });
}

function parseDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
