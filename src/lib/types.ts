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

export function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}
