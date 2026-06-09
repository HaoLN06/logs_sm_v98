import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface StoredAnalysis {
  id: string;
  name: string;
  createdAt: string;
  result: unknown;
}

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const HISTORY_FILE = path.join(DATA_DIRECTORY, "analysis-history.json");
const MAX_HISTORY = 30;

async function readHistory(): Promise<StoredAnalysis[]> {
  try {
    return JSON.parse(await readFile(HISTORY_FILE, "utf8")) as StoredAnalysis[];
  } catch {
    return [];
  }
}

async function writeHistory(history: StoredAnalysis[]) {
  await mkdir(DATA_DIRECTORY, { recursive: true });
  const temporary = `${HISTORY_FILE}.tmp`;
  await writeFile(temporary, JSON.stringify(history, null, 2), "utf8");
  await rename(temporary, HISTORY_FILE);
}

export async function listHistory() {
  return readHistory();
}

export async function saveHistory(name: string, result: unknown) {
  const history = await readHistory();
  const entry = { id: randomUUID(), name, createdAt: new Date().toISOString(), result };
  await writeHistory([entry, ...history].slice(0, MAX_HISTORY));
  return entry;
}

export async function deleteHistory(id: string) {
  const history = await readHistory();
  await writeHistory(history.filter((entry) => entry.id !== id));
}
