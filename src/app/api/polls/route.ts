import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig, addPollToIndex, isPollSlugTaken, getAllPollSlugs, getAllVotes } from "@/lib/kv";
import { validateGlobalToken, generateAdminToken } from "@/lib/auth";
import { isValidSlug, generateOptionId } from "@/lib/types";
import type { PollConfig, PollSummary, PollOption, PollType, VotingStyle } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { slug, title, description, type, votingStyle, dates, options } = body as {
    slug?: string;
    title?: string;
    description?: string;
    type?: string;
    votingStyle?: string;
    dates?: string[];
    options?: unknown[];
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

  if (type !== "date" && type !== "option") {
    return NextResponse.json({ error: "type must be 'date' or 'option'" }, { status: 400 });
  }

  if (votingStyle !== "yes-maybe-no" && votingStyle !== "single-choice" && votingStyle !== "multi-select") {
    return NextResponse.json({ error: "votingStyle must be 'yes-maybe-no', 'single-choice', or 'multi-select'" }, { status: 400 });
  }

  let validatedDates: string[] = [];
  let validatedOptions: PollOption[] = [];

  if (type === "date") {
    if (!Array.isArray(dates) || dates.length === 0 || dates.length > 30) {
      return NextResponse.json({ error: "dates required, 1-30 items" }, { status: 400 });
    }

    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dates.every((d) => typeof d === "string" && isoDateRegex.test(d))) {
      return NextResponse.json({ error: "dates must be ISO date strings (YYYY-MM-DD)" }, { status: 400 });
    }

    validatedDates = [...dates].sort();
  } else {
    // type === "option"
    if (!Array.isArray(options) || options.length < 2 || options.length > 30) {
      return NextResponse.json({ error: "options required, 2-30 items" }, { status: 400 });
    }

    for (const opt of options) {
      if (!opt || typeof opt !== "object") {
        return NextResponse.json({ error: "each option must be an object" }, { status: 400 });
      }
      const option = opt as { title?: string; description?: string };
      if (!option.title || typeof option.title !== "string" || option.title.trim().length === 0 || option.title.length > 200) {
        return NextResponse.json({ error: "option title required, max 200 chars" }, { status: 400 });
      }
      if (option.description && (typeof option.description !== "string" || option.description.length > 500)) {
        return NextResponse.json({ error: "option description max 500 chars" }, { status: 400 });
      }

      validatedOptions.push({
        id: generateOptionId(),
        title: option.title.trim(),
        description: option.description?.trim() || undefined,
      });
    }
  }

  if (await isPollSlugTaken(slug)) {
    return NextResponse.json({ error: "slug already taken" }, { status: 409 });
  }

  const adminToken = generateAdminToken();
  const config: PollConfig = {
    type: type as PollType,
    votingStyle: votingStyle as VotingStyle,
    title: title.trim(),
    description: (description || "").trim(),
    dates: validatedDates,
    options: validatedOptions,
    adminToken,
    createdAt: new Date().toISOString(),
  };

  await setConfig(slug, config);
  await addPollToIndex(slug);

  return NextResponse.json({
    slug,
    adminToken,
    voterUrl: `/p/${slug}`,
    adminUrl: `/p/${slug}/admin?token=${adminToken}`
  }, { status: 201 });
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
      type: config.type,
      votingStyle: config.votingStyle,
      itemCount: config.type === "date" ? config.dates.length : config.options.length,
      voteCount: votes.length,
      createdAt: config.createdAt,
    });
  }

  polls.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ polls });
}
