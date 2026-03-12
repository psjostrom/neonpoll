import { NextRequest, NextResponse } from "next/server";
import { getConfig, getVote, setVote } from "@/lib/kv";
import type { Vote, VoteValue } from "@/lib/types";

const VALID_VALUES: VoteValue[] = ["yes", "maybe", "no"];

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const vote = await getVote(name.trim());
  if (!vote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(vote);
}

export async function POST(request: NextRequest) {
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

  const config = await getConfig();
  const configDates = new Set(config?.dates || []);

  const filteredVotes: Record<string, VoteValue> = {};
  for (const [date, value] of Object.entries(votes)) {
    if (configDates.has(date) && VALID_VALUES.includes(value as VoteValue)) {
      filteredVotes[date] = value as VoteValue;
    }
  }

  const vote: Vote = {
    name: name.trim(),
    votes: filteredVotes,
  };

  await setVote(vote);
  return NextResponse.json(vote);
}
