import assert from "node:assert/strict";
import type { AnalysisHistoryEntry } from "../lib/anomaly-detection";
import type { IssueGroup } from "../lib/log-parser";
import { buildTrendSummary, filterHistoryByDays } from "../lib/trend-analysis";

function issue(fingerprint: string, count: number): IssueGroup {
  return { fingerprint, count, title: fingerprint, category: "Test", component: "JS", level: "E", priority: "High", firstSeen: new Date(), lastSeen: new Date(), example: fingerprint, occurrences: [] };
}

function session(id: string, createdAt: string, errors: number, issues: IssueGroup[]): AnalysisHistoryEntry {
  return { id, name: id, createdAt, result: { levelCounts: { E: errors }, issues, componentErrors: [{ name: "JS", count: errors }] } };
}

const history = [
  session("latest", "2026-06-09T10:00:00.000Z", 30, [issue("repeat", 20), issue("growing", 10)]),
  session("same-day-old", "2026-06-09T08:00:00.000Z", 999, [issue("ignored", 999)]),
  session("previous", "2026-06-08T10:00:00.000Z", 20, [issue("repeat", 15), issue("growing", 2)]),
  session("old", "2026-05-01T10:00:00.000Z", 5, [issue("old-only", 5)]),
];

const summary = buildTrendSummary(history, "day");
assert.equal(summary.points.length, 3);
assert.equal(summary.points.at(-1)?.errors, 30);
assert.equal(summary.latestErrors, 30);
assert.equal(summary.growingIssues[0].fingerprint, "growing");
assert.equal(summary.growingIssues[0].delta, 8);
assert.equal(summary.recurringIssues, 2);
assert.equal(filterHistoryByDays(history, 7).length, 3);
console.log("Trend analysis tests passed.");
