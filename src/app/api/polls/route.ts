import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig, addPollToIndex, isPollSlugTaken, getAllPollSlugs, getAllVotes } from "@/lib/kv";
import { validateGlobalToken, generateAdminToken } from "@/lib/auth";
import { isValidSlug } from "@/lib/types";
import type { PollConfig, PollSummary } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slug, title, description, dates } = body as {
    slug?: string;
    title?: string;
    description?: string;
    dates?: string[];
  };

  if (!slug || typeof slug !== "string" || !isValidSlug(slug)) {
    return NextResponse.json(
      { error: "slug required, 3-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens" },
      { status: 400 }
    );
  }

  if (!title || typeof title !== "string" || title.trim().length === 0 || title.length > 100) {
    return NextResponse.json({ error: "title required, max 100 chars" }, { status: 400 });
  }

  if (description && (typeof description !== "string" || description.length > 500)) {
    return NextResponse.json({ error: "description max 500 chars" }, { status: 400 });
  }

  if (!Array.isArray(dates) || dates.length === 0 || dates.length > 30) {
    return NextResponse.json({ error: "dates required, 1-30 items" }, { status: 400 });
  }

  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
    return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
  }

  if (await isPollSlugTaken(slug)) {
    return NextResponse.json({ error: "slug already taken" }, { status: 409 });
  }

  const adminToken = generateAdminToken();
  const config: PollConfig = {
    title: title.trim(),
    description: (description || "").trim(),
    dates: [...dates].sort(),
    adminToken,
    createdAt: new Date().toISOString(),
  };

  await setConfig(slug, config);
  await addPollToIndex(slug);

  return NextResponse.json({ slug, adminToken }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!validateGlobalToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slugs = await getAllPollSlugs();
  const polls: PollSummary[] = [];

  for (const slug of slugs) {
    const config = await getConfig(slug);
    if (!config) continue;
    const votes = await getAllVotes(slug);
    polls.push({
      slug,
      title: config.title,
      description: config.description,
      dateCount: config.dates.length,
      voteCount: votes.length,
      createdAt: config.createdAt,
    });
  }

  polls.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ polls });
}
