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

  if (config.votingStyle === "single-choice" || config.votingStyle === "multi-select") {
    const ranked = items
      .map((item) => {
        const voteCount = votes.filter((v) => v.votes[item.id] === "yes").length;
        return { ...item, voteCount };
      })
      .sort((a, b) => b.voteCount - a.voteCount);
    return { ranked };
  }

  // ranked voting
  const rankCount = config.rankCount ?? 3;
  const weighted = config.rankWeighted ?? true;
  const ranked = items
    .map((item) => {
      let score = 0;
      let voteCount = 0;
      for (const v of votes) {
        const rank = v.votes[item.id];
        if (rank) {
          const rankNum = parseInt(rank, 10);
          if (rankNum >= 1 && rankNum <= rankCount) {
            voteCount++;
            score += weighted ? (rankCount - rankNum + 1) : 1;
          }
        }
      }
      return { ...item, voteCount, score };
    })
    .sort((a, b) => b.score! - a.score! || b.voteCount - a.voteCount);
  return { ranked };
}
