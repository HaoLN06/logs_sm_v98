import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseLog } from "../lib/log-parser";
import { filterAnalysisByPreset } from "../lib/time-filter";

const path = resolve("logs_files/sm-13083.log");
const result = parseLog(readFileSync(path, "utf8"), "sm-13083.log", statSync(path).size);
const fifteenMinutes = filterAnalysisByPreset(result, "15");
const oneHour = filterAnalysisByPreset(result, "60");

assert(fifteenMinutes.parsedLines > 0);
assert(fifteenMinutes.parsedLines <= oneHour.parsedLines);
assert(oneHour.parsedLines <= result.parsedLines);
assert(fifteenMinutes.issues.every((issue) => issue.count <= (result.issues.find((source) => source.fingerprint === issue.fingerprint)?.count || 0)));
console.log("Time filter tests passed.");
