export type VoteValue = "yes" | "maybe" | "no";

export interface PollConfig {
  title: string;
  description: string;
  dates: string[];
}

export interface Vote {
  name: string;
  votes: Record<string, VoteValue>;
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
