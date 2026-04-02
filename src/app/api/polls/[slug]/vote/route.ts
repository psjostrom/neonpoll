import { NextRequest, NextResponse } from "next/server";
import { getConfig, getVote, setVote } from "@/lib/kv";
import { getValidKeys } from "@/lib/types";
import type { Vote, VoteValue } from "@/lib/types";

const VALID_VALUES = ["yes", "maybe", "no"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const name = request.nextUrl.searchParams.get("name");
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const config = await getConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  const vote = await getVote(slug, name.trim());
  if (!vote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(vote);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, votes } = body as { name?: string; votes?: Record<string, string> };

  if (!name || typeof name !== "string" || name.trim().length === 0 || name.trim().length > 50) {
    return NextResponse.json({ error: "name required, max 50 chars" }, { status: 400 });
  }

  if (!votes || typeof votes !== "object") {
    return NextResponse.json({ error: "votes required" }, { status: 400 });
  }

  const config = await getConfig(slug);
  if (!config) {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  const validKeys = getValidKeys(config);
  const filteredVotes: Record<string, VoteValue> = {};

  if (config.votingStyle === "yes-maybe-no") {
    // Accept yes/maybe/no values
    for (const [key, value] of Object.entries(votes)) {
      if (validKeys.has(key) && VALID_VALUES.includes(value as VoteValue)) {
        filteredVotes[key] = value as VoteValue;
      }
    }
  } else if (config.votingStyle === "single-choice") {
    // Only allow one key with value "yes"
    const yesKeys = Object.entries(votes).filter(([key, value]) => validKeys.has(key) && value === "yes");
    if (yesKeys.length !== 1) {
      return NextResponse.json({ error: "single-choice requires exactly one 'yes' vote" }, { status: 400 });
    }
    filteredVotes[yesKeys[0][0]] = "yes";
  } else if (config.votingStyle === "multi-select") {
    // multi-select: only allow "yes" values
    for (const [key, value] of Object.entries(votes)) {
      if (validKeys.has(key)) {
        if (value !== "yes") {
          return NextResponse.json({ error: "multi-select only accepts 'yes' votes" }, { status: 400 });
        }
        filteredVotes[key] = "yes";
      }
    }
  } else {
    // ranked: values are rank numbers as strings ("1", "2", "3"...)
    const rankCount = config.rankCount ?? 3;
    const usedRanks = new Set<string>();
    for (const [key, value] of Object.entries(votes)) {
      if (!validKeys.has(key)) continue;
      const rankNum = parseInt(value, 10);
      if (isNaN(rankNum) || rankNum < 1 || rankNum > rankCount) continue;
      const rankStr = String(rankNum);
      if (usedRanks.has(rankStr)) continue; // each rank used at most once
      usedRanks.add(rankStr);
      filteredVotes[key] = rankStr as VoteValue;
    }
  }

  const vote: Vote = {
    name: name.trim(),
    votes: filteredVotes,
  };

  await setVote(slug, vote);
  return NextResponse.json({ ok: true });
}
