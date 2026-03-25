import { NextRequest, NextResponse } from "next/server";
import { getAllVotes, deleteAllData } from "@/lib/kv";
import { validateToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!validateToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const votes = await getAllVotes();
  return NextResponse.json({ votes });
}

export async function DELETE(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!validateToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteAllData();
  return NextResponse.json({ ok: true });
}
