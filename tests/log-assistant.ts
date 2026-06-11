import assert from "node:assert/strict";
import { answerLogQuestion } from "../lib/log-assistant";
import type { AnalysisResult } from "../lib/log-parser";

const result: AnalysisResult = {
  fileName: "app.log",
  sourceFiles: [{ name: "app.log", size: 1000 }],
  fileSize: 1000,
  totalLines: 100,
  parsedLines: 100,
  continuationLines: 0,
  events: [],
  levelCounts: { E: 20, W: 5 },
  componentErrors: [{ name: "RTE", count: 20 }],
  timeline: [],
  timeBuckets: [],
  issues: [{
    fingerprint: "db", title: "Database timeout", category: "Database", component: "RTE", level: "E", priority: "High",
    count: 20, firstSeen: new Date(), lastSeen: new Date(), example: "timeout", occurrences: [{
      sourceFile: "app.log", lineNumber: 42, endLine: 42, processId: 1, threadId: 2, timestamp: new Date(), component: "RTE", level: "E", message: "timeout", continuationLines: [],
    }],
  }],
};

assert(answerLogQuestion("Tóm tắt tình hình", result).text.includes("100 sự kiện"));
assert.deepEqual(answerLogQuestion("Lỗi nào nhiều nhất?", result).issueFingerprints, ["db"]);
assert(answerLogQuestion("Nằm ở file dòng nào?", result).text.includes("app.log, dòng 42"));
assert(answerLogQuestion("component nào?", result).text.includes("RTE"));
console.log("Log assistant tests passed.");
