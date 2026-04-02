import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/kv";
import { validatePollToken } from "@/lib/auth";
import { generateOptionId } from "@/lib/types";
import type { PollConfig, VotingStyle } from "@/lib/types";

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

  const update = body as {
    title?: string;
    description?: string;
    votingStyle?: string;
    dates?: string[];
    options?: unknown[];
  };

  if (!update.title || typeof update.title !== "string" || update.title.length > 100) {
    return NextResponse.json({ error: "title required, max 100 chars" }, { status: 400 });
  }

  if (update.description && (typeof update.description !== "string" || update.description.length > 500)) {
    return NextResponse.json({ error: "description max 500 chars" }, { status: 400 });
  }

  const votingStyle = (update.votingStyle || existing.votingStyle) as VotingStyle;
  if (votingStyle !== "yes-maybe-no" && votingStyle !== "single-choice" && votingStyle !== "multi-select") {
    return NextResponse.json({ error: "votingStyle must be 'yes-maybe-no', 'single-choice', or 'multi-select'" }, { status: 400 });
  }

  let validated: PollConfig;

  if (existing.type === "date") {
    if (!Array.isArray(update.dates) || update.dates.length === 0 || update.dates.length > 30) {
      return NextResponse.json({ error: "dates required, 1-30 items" }, { status: 400 });
    }

    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!update.dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
      return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
    }

    validated = {
      type: existing.type,
      votingStyle,
      title: update.title.trim(),
      description: (update.description || "").trim(),
      dates: [...update.dates].sort(),
      options: [],
      adminToken: existing.adminToken,
      createdAt: existing.createdAt,
    };
  } else {
    // type === "option"
    if (!Array.isArray(update.options) || update.options.length < 2 || update.options.length > 30) {
      return NextResponse.json({ error: "options required, 2-30 items" }, { status: 400 });
    }

    const validatedOptions = [];
    for (const opt of update.options) {
      if (!opt || typeof opt !== "object") {
        return NextResponse.json({ error: "each option must be an object" }, { status: 400 });
      }
      const option = opt as { id?: string; title?: string; description?: string };
      if (!option.title || typeof option.title !== "string" || option.title.trim().length === 0 || option.title.length > 200) {
        return NextResponse.json({ error: "option title required, max 200 chars" }, { status: 400 });
      }
      if (option.description && (typeof option.description !== "string" || option.description.length > 500)) {
        return NextResponse.json({ error: "option description max 500 chars" }, { status: 400 });
      }

      validatedOptions.push({
        id: option.id && typeof option.id === "string" ? option.id : generateOptionId(),
        title: option.title.trim(),
        description: option.description?.trim() || undefined,
      });
    }

    validated = {
      type: existing.type,
      votingStyle,
      title: update.title.trim(),
      description: (update.description || "").trim(),
      dates: [],
      options: validatedOptions,
      adminToken: existing.adminToken,
      createdAt: existing.createdAt,
    };
  }

  await setConfig(slug, validated);
  const { adminToken: _, ...publicConfig } = validated;
  return NextResponse.json(publicConfig);
}
