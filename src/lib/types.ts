export type PollType = "date" | "option";
export type VotingStyle = "yes-maybe-no" | "single-choice" | "multi-select";
export type VoteValue = "yes" | "maybe" | "no";

export interface PollOption {
  id: string;
  title: string;
  description?: string;
}

export interface PollConfig {
  type: PollType;
  votingStyle: VotingStyle;
  title: string;
  description: string;
  dates: string[];
  options: PollOption[];
  adminToken: string;
  createdAt: string;
}

export interface Vote {
  name: string;
  votes: Record<string, VoteValue>;
}

export interface PollSummary {
  slug: string;
  title: string;
  description: string;
  type: PollType;
  votingStyle: VotingStyle;
  itemCount: number;
  voteCount: number;
  createdAt: string;
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

export function getIsoWeek(iso: string): number {
  const d = new Date(iso + "T12:00:00");
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

export function getValidKeys(config: PollConfig): Set<string> {
  if (config.type === "date") return new Set(config.dates);
  return new Set(config.options.map((o) => o.id));
}

export function generateOptionId(): string {
  return Math.random().toString(36).slice(2, 10);
}
