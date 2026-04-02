import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";
import type { PollConfig } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const config = await getConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }
  // Don't expose adminToken to public
  const { adminToken: _, ...publicConfig } = config;
  return NextResponse.json(publicConfig);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const token = request.nextUrl.searchParams.get("token");

  const existing = await getConfig(slug);
  if (!existing) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  if (!validatePollToken(token, existing.adminToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update = body as Partial<PollConfig>;

  if (!update.title || typeof update.title !== "string" || update.title.length > 100) {
    return NextResponse.json({ error: "title required, max 100 chars" }, { status: 400 });
  }

  if (update.description && (typeof update.description !== "string" || update.description.length > 500)) {
    return NextResponse.json({ error: "description max 500 chars" }, { status: 400 });
  }

  if (!Array.isArray(update.dates) || update.dates.length === 0 || update.dates.length > 30) {
    return NextResponse.json({ error: "dates required, 1-30 items" }, { status: 400 });
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!update.dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
    return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
  }

  const validated: PollConfig = {
    title: update.title.trim(),
    description: (update.description || "").trim(),
    dates: [...update.dates].sort(),
    adminToken: existing.adminToken,
    createdAt: existing.createdAt,
  };

  await setConfig(slug, validated);
  const { adminToken: _, ...publicConfig } = validated;
  return NextResponse.json(publicConfig);
}
