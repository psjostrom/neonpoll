import { kv } from "@vercel/kv";
import type { PollConfig, Vote } from "./types";

const CONFIG_KEY = "neonpoll:config";
const VOTE_PREFIX = "neonpoll:votes:";

export async function getConfig(): Promise<PollConfig | null> {
  return kv.get<PollConfig>(CONFIG_KEY);
}

export async function setConfig(config: PollConfig): Promise<void> {
  await kv.set(CONFIG_KEY, config);
}

export async function getVote(name: string): Promise<Vote | null> {
  const key = VOTE_PREFIX + name.toLowerCase().trim();
  return kv.get<Vote>(key);
}

export async function setVote(vote: Vote): Promise<void> {
  const key = VOTE_PREFIX + vote.name.toLowerCase().trim();
  await kv.set(key, vote);
}

export async function getAllVotes(): Promise<Vote[]> {
  const keys: string[] = [];
  const initial = await kv.scan(0, {
    match: VOTE_PREFIX + "*",
    count: 100,
  });
  let cursor = initial[0];
  keys.push(...initial[1]);

  while (Number(cursor) !== 0) {
    const page = await kv.scan(cursor, {
      match: VOTE_PREFIX + "*",
      count: 100,
    });
    cursor = page[0];
    keys.push(...page[1]);
  }

  if (keys.length === 0) return [];

  const values = await kv.mget<Vote[]>(...keys);
  return values.filter((v): v is Vote => v !== null);
}
