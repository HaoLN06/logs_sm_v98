import { NextRequest, NextResponse } from "next/server";
import { deleteHistory, listHistory, saveHistory } from "@/lib/analysis-history";

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
  if (!id) return NextResponse.json({ error: "Thiếu ID lịch sử." }, { status: 400 });
  await deleteHistory(id);
  return NextResponse.json({ success: true });
}
