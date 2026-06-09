export type LogLevel = "E" | "W" | "A" | "I" | "D" | string;

export interface LogEvent {
  sourceFile: string;
  lineNumber: number;
  endLine: number;
  processId: number;
  threadId: number;
  timestamp: Date;
  component: string;
  level: LogLevel;
  message: string;
  continuationLines: string[];
}

export interface IssueGroup {
  fingerprint: string;
  title: string;
  category: string;
  component: string;
  level: LogLevel;
  priority: "Critical" | "High" | "Medium" | "Low";
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  example: string;
  occurrences: LogEvent[];
}

export interface TimeBucket {
  startTime: Date;
  totalEvents: number;
  levelCounts: Record<string, number>;
  componentErrors: Record<string, number>;
  issueCounts: Record<string, number>;
}

export interface AnalysisResult {
  fileName: string;
  sourceFiles: { name: string; size: number }[];
  fileSize: number;
  totalLines: number;
  parsedLines: number;
  continuationLines: number;
  events: LogEvent[];
  issues: IssueGroup[];
  levelCounts: Record<string, number>;
  componentErrors: { name: string; count: number }[];
  timeline: { time: string; errors: number; warnings: number; alerts: number }[];
  timeBuckets: TimeBucket[];
  firstSeen?: Date;
  lastSeen?: Date;
}

const LINE_PATTERN =
  /^\s*(\d+)\(\s*(\d+)\)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(\S+)\s+([A-Z])\s+(.*)$/;

function parseTimestamp(date: string, time: string) {
  const [month, day, year] = date.split("/").map(Number);
  const [clock, milliseconds] = time.split(".");
  const [hour, minute, second] = clock.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second, Number(milliseconds));
}

function normalizeMessage(message: string) {
  return message
    .replace(/0x[0-9a-f]+/gi, "{address}")
    .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, "{date}")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "{date}")
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g, "{time}")
    .replace(/\b(?:[A-Z]{2,}[A-Z0-9]*_)?\d{2,}_\d{4,}\b/g, "{record_id}")
    .replace(/\b\d+\b/g, "{number}")
    .replace(/\s+/g, " ")
    .trim();
}

function describeIssue(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("typeerror: from is null")) return { title: "dynamicFormGenerator: from is null", category: "JavaScript" };
  if (lower.includes("idle-session timeout")) return { title: "PostgreSQL idle-session timeout", category: "Database" };
  if (lower.includes("setproperty() called")) {
    const file = message.match(/class SCFile\('([^']+)'\)/)?.[1];
    return { title: `Không thể gán thuộc tính${file ? ` trên ${file}` : ""}`, category: "Data model" };
  }
  if (lower.includes("unknown field")) {
    const field = message.match(/unknown field "([^"]+)"/i)?.[1];
    return { title: `Field không tồn tại${field ? `: ${field}` : ""}`, category: "Schema" };
  }
  if (lower.includes("no license for module")) {
    const module = message.match(/module\s*\(\s*([^)]+)\s*\)/i)?.[1]?.trim();
    return { title: `Vượt giới hạn license${module ? `: ${module}` : ""}`, category: "License" };
  }
  if (lower.includes("globallist") && lower.includes("too many items")) {
    const list = message.match(/Globallist\s+([^,\s]+)/i)?.[1];
    return { title: `Globallist quá lớn${list ? `: ${list}` : ""}`, category: "Performance" };
  }
  if (lower.includes("null value in column")) {
    const column = message.match(/column "([^"]+)"/i)?.[1];
    return { title: `Vi phạm NOT NULL${column ? `: ${column}` : ""}`, category: "Database" };
  }
  if (lower.includes("contains invalid code")) return { title: "HTML template chứa mã không hợp lệ", category: "JavaScript" };
  if (lower.includes("send error response")) return { title: "JRTE gửi error response", category: "Runtime" };
  const clean = message.replace(/\s+/g, " ").trim();
  return { title: clean.length > 82 ? `${clean.slice(0, 79)}...` : clean, category: "Other" };
}

function getPriority(level: LogLevel, count: number, category: string): IssueGroup["priority"] {
  if ((level === "E" && count >= 100) || (category === "License" && count >= 20)) return "Critical";
  if (level === "E" || count >= 50) return "High";
  if (level === "A" || level === "W") return "Medium";
  return "Low";
}

function shouldGroup(event: LogEvent) {
  if (!["E", "W", "A"].includes(event.level)) return false;
  const message = event.message.toLowerCase();
  return !["exception stack:", "api=pqprepare", "api=pqexecprepared", "summary-", "failed executing function"].some((prefix) => message.startsWith(prefix));
}

export function parseLog(text: string, fileName: string, fileSize: number): AnalysisResult {
  return parseLogs([{ text, name: fileName, size: fileSize }]);
}

export function parseLogs(files: { text: string; name: string; size: number }[]): AnalysisResult {
  const events: LogEvent[] = [];
  let continuationLines = 0;
  let totalLines = 0;

  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    let current: LogEvent | undefined;
    totalLines += lines.length;
    for (const [index, line] of lines.entries()) {
      const match = line.match(LINE_PATTERN);
      if (match) {
        current = {
          sourceFile: file.name, lineNumber: index + 1, endLine: index + 1,
          processId: Number(match[1]), threadId: Number(match[2]),
          timestamp: parseTimestamp(match[3], match[4]), component: match[5],
          level: match[6], message: match[7].trim(), continuationLines: [],
        };
        events.push(current);
      } else if (line.trim() && current) {
        current.continuationLines.push(line.trim());
        current.endLine = index + 1;
        continuationLines++;
      }
    }
  }

  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const levelCounts: Record<string, number> = {};
  const componentMap = new Map<string, number>();
  const timelineMap = new Map<string, { errors: number; warnings: number; alerts: number }>();
  const groups = new Map<string, IssueGroup>();
  const timeBucketMap = new Map<number, TimeBucket>();

  for (const event of events) {
    const bucketTime = new Date(event.timestamp);
    bucketTime.setMinutes(Math.floor(bucketTime.getMinutes() / 5) * 5, 0, 0);
    const bucketKey = bucketTime.getTime();
    const timeBucket = timeBucketMap.get(bucketKey) || {
      startTime: bucketTime, totalEvents: 0, levelCounts: {}, componentErrors: {}, issueCounts: {},
    };
    timeBucket.totalEvents++;
    timeBucket.levelCounts[event.level] = (timeBucket.levelCounts[event.level] || 0) + 1;
    levelCounts[event.level] = (levelCounts[event.level] || 0) + 1;
    if (event.level === "E") {
      componentMap.set(event.component, (componentMap.get(event.component) || 0) + 1);
      timeBucket.componentErrors[event.component] = (timeBucket.componentErrors[event.component] || 0) + 1;
    }
    const hour = `${String(event.timestamp.getHours()).padStart(2, "0")}:00`;
    const bucket = timelineMap.get(hour) || { errors: 0, warnings: 0, alerts: 0 };
    if (event.level === "E") bucket.errors++;
    if (event.level === "W") bucket.warnings++;
    if (event.level === "A") bucket.alerts++;
    timelineMap.set(hour, bucket);
    if (!shouldGroup(event)) {
      timeBucketMap.set(bucketKey, timeBucket);
      continue;
    }

    const normalized = normalizeMessage(event.message);
    const { title, category } = describeIssue(event.message);
    const fingerprint = category === "Other" ? `${event.component}|${event.level}|${normalized}` : `${event.component}|${event.level}|${title}`;
    timeBucket.issueCounts[fingerprint] = (timeBucket.issueCounts[fingerprint] || 0) + 1;
    timeBucketMap.set(bucketKey, timeBucket);
    const existing = groups.get(fingerprint);
    if (existing) {
      existing.count++;
      existing.lastSeen = event.timestamp;
      existing.occurrences.push(event);
    } else {
      groups.set(fingerprint, {
        fingerprint, title, category, component: event.component, level: event.level,
        priority: "Low", count: 1, firstSeen: event.timestamp, lastSeen: event.timestamp,
        example: event.message, occurrences: [event],
      });
    }
  }

  return {
    fileName: files.length === 1 ? files[0].name : `${files.length} files`,
    sourceFiles: files.map(({ name, size }) => ({ name, size })),
    fileSize: files.reduce((sum, file) => sum + file.size, 0),
    totalLines, parsedLines: events.length, continuationLines, events,
    issues: [...groups.values()].map((group) => ({ ...group, priority: getPriority(group.level, group.count, group.category) })).sort((a, b) => b.count - a.count),
    levelCounts,
    componentErrors: [...componentMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    timeline: [...timelineMap.entries()].map(([time, values]) => ({ time, ...values })).sort((a, b) => a.time.localeCompare(b.time)),
    timeBuckets: [...timeBucketMap.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
    firstSeen: events[0]?.timestamp, lastSeen: events.at(-1)?.timestamp,
  };
}
