import { NextRequest, NextResponse } from "next/server";
import { getConfig, deletePoll } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const config = await getConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  if (!validatePollToken(token, config.adminToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deletePoll(slug);
  return NextResponse.json({ ok: true });
}
