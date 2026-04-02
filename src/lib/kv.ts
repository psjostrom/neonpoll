import { kv } from "@vercel/kv";
import type { PollConfig, Vote } from "./types";

const POLL_INDEX_KEY = "neonpoll:polls";

function configKey(slug: string) {
  return `neonpoll:poll:${slug}:config`;
}

function voteKey(slug: string, name: string) {
  return `neonpoll:poll:${slug}:votes:${name.toLowerCase().trim()}`;
}

function votePrefix(slug: string) {
  return `neonpoll:poll:${slug}:votes:`;
}

// --- Poll index ---

export async function addPollToIndex(slug: string): Promise<void> {
  await kv.sadd(POLL_INDEX_KEY, slug);
}

export async function removePollFromIndex(slug: string): Promise<void> {
  await kv.srem(POLL_INDEX_KEY, slug);
}

export async function getAllPollSlugs(): Promise<string[]> {
  return kv.smembers(POLL_INDEX_KEY);
}

export async function isPollSlugTaken(slug: string): Promise<boolean> {
  return kv.sismember(POLL_INDEX_KEY, slug).then((r) => r === 1);
}

// --- Config ---

export async function getConfig(slug: string): Promise<PollConfig | null> {
  return kv.get<PollConfig>(configKey(slug));
}

export async function setConfig(slug: string, config: PollConfig): Promise<void> {
  await kv.set(configKey(slug), config);
}

// --- Votes ---

export async function getVote(slug: string, name: string): Promise<Vote | null> {
  return kv.get<Vote>(voteKey(slug, name));
}

export async function setVote(slug: string, vote: Vote): Promise<void> {
  await kv.set(voteKey(slug, vote.name), vote);
}

export async function getAllVotes(slug: string): Promise<Vote[]> {
  const prefix = votePrefix(slug);
  const keys = await scanKeys(prefix + "*");
  if (keys.length === 0) return [];
  const values = await kv.mget<Vote[]>(...keys);
  return values.filter((v): v is Vote => v !== null);
}

// --- Delete ---

export async function deletePoll(slug: string): Promise<void> {
  const prefix = votePrefix(slug);
  const voteKeys = await scanKeys(prefix + "*");
  const allKeys = [configKey(slug), ...voteKeys];
  if (allKeys.length > 0) {
    await kv.del(...allKeys);
  }
  await removePollFromIndex(slug);
}

export async function wipeAllLegacyData(): Promise<void> {
  const keys = await scanKeys("neonpoll:*");
  if (keys.length > 0) {
    await kv.del(...keys);
  }
}

// --- Helpers ---

async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const [next, batch] = await kv.scan(cursor, { match: pattern, count: 100 });
    cursor = Number(next);
    keys.push(...batch);
  } while (cursor !== 0);
  return keys;
}
