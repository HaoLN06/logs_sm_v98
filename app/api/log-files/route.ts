import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const LOG_DIRECTORY = path.join(process.cwd(), "logs_files");
const ALLOWED_EXTENSIONS = new Set([".log", ".txt"]);

async function availableFiles() {
  const entries = await readdir(LOG_DIRECTORY, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);
}

export async function GET() {
  try {
    const names = await availableFiles();
    const files = await Promise.all(
      names.map(async (name) => {
        const details = await stat(path.join(LOG_DIRECTORY, name));
        return { name, size: details.size, modifiedAt: details.mtime.toISOString() };
      }),
    );
    return NextResponse.json({ files: files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)) });
  } catch {
    return NextResponse.json({ files: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { names?: string[] };
    const allowed = new Set(await availableFiles());
    const names = [...new Set(body.names || [])];

    if (!names.length || names.some((name) => !allowed.has(name))) {
      return NextResponse.json({ error: "Danh sách file không hợp lệ." }, { status: 400 });
    }

    const files = await Promise.all(
      names.map(async (name) => {
        const fullPath = path.join(LOG_DIRECTORY, name);
        const [text, details] = await Promise.all([readFile(fullPath, "utf8"), stat(fullPath)]);
        return { name, size: details.size, text };
      }),
    );

    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ error: "Không thể đọc file log." }, { status: 500 });
  }
}
