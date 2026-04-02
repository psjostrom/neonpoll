import type { PollConfig, Vote } from "./types";

export interface RankedItem {
  id: string;
  title: string;
  voteCount: number;
  yesCount?: number;
  maybeCount?: number;
  noCount?: number;
  score?: number;
}

export function computeSummary(
  config: PollConfig,
  votes: Vote[]
): { ranked: RankedItem[] } {
  const items =
    config.type === "date"
      ? config.dates.map((d) => ({ id: d, title: d }))
      : config.options.map((o) => ({ id: o.id, title: o.title }));

  if (config.votingStyle === "yes-maybe-no") {
    const ranked = items
      .map((item) => {
        const yesCount = votes.filter((v) => v.votes[item.id] === "yes").length;
        const maybeCount = votes.filter((v) => v.votes[item.id] === "maybe").length;
        const noCount = votes.filter((v) => v.votes[item.id] === "no").length;
        const score = yesCount + maybeCount * 0.5;
        return { ...item, voteCount: yesCount, yesCount, maybeCount, noCount, score };
      })
      .sort((a, b) => b.score! - a.score! || b.yesCount! - a.yesCount!);
    return { ranked };
  }

  // single-choice and multi-select: count "yes" votes per item
  const ranked = items
    .map((item) => {
      const voteCount = votes.filter((v) => v.votes[item.id] === "yes").length;
      return { ...item, voteCount };
    })
    .sort((a, b) => b.voteCount - a.voteCount);
  return { ranked };
}
