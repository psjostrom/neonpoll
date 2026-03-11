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
