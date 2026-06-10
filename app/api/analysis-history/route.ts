import { NextRequest, NextResponse } from "next/server";
import { deleteHistoryEntries, listHistory, saveHistory } from "@/lib/analysis-history";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ history: await listHistory() });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { name?: string; result?: unknown };
  if (!body.name || !body.result) {
    return NextResponse.json({ error: "Dữ liệu lịch sử không hợp lệ." }, { status: 400 });
  }
  return NextResponse.json({ entry: await saveHistory(body.name, body.result) }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const body = await request.json().catch(() => ({})) as { ids?: unknown };
  const ids = [...new Set([
    ...(id ? [id] : []),
    ...(Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === "string" && value.length > 0) : []),
  ])];
  if (!ids.length) return NextResponse.json({ error: "Thiếu ID lịch sử." }, { status: 400 });
  const deletedCount = await deleteHistoryEntries(ids);
  return NextResponse.json({ success: true, deletedCount });
}
