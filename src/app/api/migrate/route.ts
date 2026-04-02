import { NextRequest, NextResponse } from "next/server";
import { validateGlobalToken } from "@/lib/auth";
import { wipeAllLegacyData } from "@/lib/kv";

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!validateGlobalToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await wipeAllLegacyData();
  return NextResponse.json({ ok: true, message: "All legacy data wiped" });
}
