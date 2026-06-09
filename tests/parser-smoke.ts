import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { parseLog, parseLogs } from "../lib/log-parser";

const path = resolve("logs_files/sm-13083.log");
const text = readFileSync(path, "utf8");
const size = statSync(path).size;
const result = parseLog(text, "sm-13083.log", size);

assert(result.parsedLines > 0);
assert((result.levelCounts.E || 0) > 0);
assert((result.levelCounts.W || 0) > 0);
assert(result.continuationLines > 0);
assert(result.timeBuckets.length > 0);
assert.equal(result.timeBuckets.reduce((sum, bucket) => sum + bucket.totalEvents, 0), result.parsedLines);
assert(result.issues.some((issue) => issue.title.includes("dynamicFormGenerator")));
assert(result.issues.some((issue) => issue.title.includes("idle-session timeout")));
assert(result.issues.some((issue) => issue.category === "License"));
const dynamicFormIssue = result.issues.find((issue) => issue.title.includes("dynamicFormGenerator"));
assert(dynamicFormIssue?.occurrences.length);
assert((dynamicFormIssue?.occurrences[0].lineNumber || 0) > 0);
assert((dynamicFormIssue?.occurrences[0].endLine || 0) >= (dynamicFormIssue?.occurrences[0].lineNumber || 0));

const combined = parseLogs([
  { text, name: "sm-13083-a.log", size },
  { text, name: "sm-13083-b.log", size },
]);
assert.equal(combined.sourceFiles.length, 2);
assert.equal(combined.parsedLines, result.parsedLines * 2);
assert.equal(combined.levelCounts.E, result.levelCounts.E * 2);
const idleTimeoutCount = result.issues.filter((issue) => issue.title.includes("idle-session timeout")).reduce((sum, issue) => sum + issue.count, 0);
const combinedIdleTimeoutCount = combined.issues.filter((issue) => issue.title.includes("idle-session timeout")).reduce((sum, issue) => sum + issue.count, 0);
assert(combinedIdleTimeoutCount >= idleTimeoutCount * 2);
assert(combined.events.some((event) => event.sourceFile === "sm-13083-b.log"));

console.log({
  parsedLines: result.parsedLines,
  continuationLines: result.continuationLines,
  errors: result.levelCounts.E,
  issueGroups: result.issues.length,
  topIssues: result.issues.slice(0, 5).map(({ title, count }) => ({ title, count })),
});
