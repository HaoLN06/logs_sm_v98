import assert from "node:assert/strict";
import { detectAnomalies, type AnalysisHistoryEntry } from "../lib/anomaly-detection";
import type { IssueGroup } from "../lib/log-parser";

function issue(fingerprint: string, count: number): IssueGroup {
  return {
    fingerprint, count, title: fingerprint, category: "Test", component: "JS",
    level: "E", priority: "High", firstSeen: new Date(), lastSeen: new Date(),
    example: fingerprint, occurrences: [],
  };
}

function session(id: string, issues: IssueGroup[]): AnalysisHistoryEntry {
  return { id, name: id, createdAt: new Date().toISOString(), result: { issues } };
}

const current = session("current", [issue("new", 3), issue("spike", 30), issue("recurring", 4), issue("normal", 11)]);
const rows = detectAnomalies(current, [
  session("recent", [issue("spike", 5), issue("normal", 10)]),
  session("older-1", [issue("spike", 5), issue("recurring", 3), issue("normal", 12)]),
  session("older-2", [issue("spike", 5), issue("normal", 9)]),
]);

assert.equal(rows.find((row) => row.fingerprint === "new")?.status, "NEW");
assert.equal(rows.find((row) => row.fingerprint === "spike")?.status, "SPIKE");
assert.equal(rows.find((row) => row.fingerprint === "recurring")?.status, "RECURRING");
assert.equal(rows.find((row) => row.fingerprint === "normal")?.status, "NORMAL");
console.log("Anomaly detection tests passed.");
