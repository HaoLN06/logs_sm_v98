import assert from "node:assert/strict";
import type { TimeBucket } from "../lib/log-parser";
import { aggregateTimeBuckets, bucketTimeline } from "../lib/time-buckets";

const source: TimeBucket[] = [
  bucket("2026-06-09T10:00:00.000Z", 3, { E: 2, W: 1 }),
  bucket("2026-06-09T10:05:00.000Z", 4, { E: 1, I: 3 }),
  bucket("2026-06-09T10:15:00.000Z", 2, { W: 2 }),
];

const fifteenMinutes = aggregateTimeBuckets(source, "15m");
assert.equal(fifteenMinutes.length, 2);
assert.equal(fifteenMinutes[0].totalEvents, 7);
assert.equal(fifteenMinutes[0].levelCounts.E, 3);
assert.equal(fifteenMinutes[0].levelCounts.W, 1);

const oneHour = aggregateTimeBuckets(source, "1h");
assert.equal(oneHour.length, 1);
assert.equal(oneHour[0].totalEvents, 9);
assert.equal(oneHour[0].levelCounts.W, 3);

const fourHours = aggregateTimeBuckets([
  bucket("2026-06-09T10:00:00", 3, { E: 3 }),
  bucket("2026-06-09T11:55:00", 2, { W: 2 }),
  bucket("2026-06-09T12:00:00", 1, { A: 1 }),
], "4h");
assert.equal(fourHours.length, 2);
assert.equal(fourHours[0].totalEvents, 5);

const timeline = bucketTimeline(source, "15m");
assert.equal(timeline[0].errors, 3);
assert.equal(timeline[1].warnings, 2);

console.log("Time bucket tests passed.");

function bucket(startTime: string, totalEvents: number, levelCounts: Record<string, number>): TimeBucket {
  return { startTime: new Date(startTime), totalEvents, levelCounts, componentErrors: {}, issueCounts: {} };
}
