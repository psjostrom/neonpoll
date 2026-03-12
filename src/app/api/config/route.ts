import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/kv";
import { validateToken } from "@/lib/auth";
import type { PollConfig } from "@/lib/types";

export async function GET() {
  const config = await getConfig();
  if (!config) {
    return NextResponse.json({ title: "", description: "", dates: [] });
  }
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!validateToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const config = body as Partial<PollConfig>;

  if (!config.title || typeof config.title !== "string" || config.title.length > 100) {
    return NextResponse.json({ error: "title required, max 100 chars" }, { status: 400 });
  }

  if (config.description && (typeof config.description !== "string" || config.description.length > 500)) {
    return NextResponse.json({ error: "description max 500 chars" }, { status: 400 });
  }

  if (!Array.isArray(config.dates) || config.dates.length === 0 || config.dates.length > 30) {
    return NextResponse.json({ error: "dates required, 1-30 items" }, { status: 400 });
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!config.dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
    return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
  }

  const validated: PollConfig = {
    title: config.title.trim(),
    description: (config.description || "").trim(),
    dates: [...config.dates].sort(),
  };

  await setConfig(validated);
  return NextResponse.json(validated);
}
