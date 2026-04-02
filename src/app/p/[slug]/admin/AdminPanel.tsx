"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, getIsoWeek } from "@/lib/types";
import type { PollConfig, Vote, VoteValue, VotingStyle, PollOption } from "@/lib/types";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { VotingStyleSelector } from "@/app/components/VotingStyleSelector";
import { OptionEditor } from "@/app/components/OptionEditor";
import { BarChart } from "@/app/components/BarChart";
import type { RankedItem } from "@/lib/summary";

export function AdminPanel({ slug, token }: { slug: string; token: string }) {
  const router = useRouter();
  const [pollType, setPollType] = useState<"date" | "option">("date");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [votingStyle, setVotingStyle] = useState<VotingStyle>("yes-maybe-no");
  const [dates, setDates] = useState<string[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [ranked, setRanked] = useState<RankedItem[]>([]);
  const [configStatus, setConfigStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const pollUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/${slug}`
    : `/p/${slug}`;

  useEffect(() => {
    async function load() {
      try {
        const [configRes, votesRes] = await Promise.all([
          fetch(`/api/polls/${encodeURIComponent(slug)}/config`),
          fetch(`/api/polls/${encodeURIComponent(slug)}/votes?token=${encodeURIComponent(token)}`),
        ]);

        if (configRes.ok) {
          const data: PollConfig = await configRes.json();
          setPollType(data.type);
          setTitle(data.title || "");
          setDescription(data.description || "");
          setVotingStyle(data.votingStyle);
          setDates(data.dates || []);
          setOptions(data.options || []);
        }

        if (votesRes.ok) {
          const data = await votesRes.json();
          setVotes(data.votes || []);
          setRanked(data.summary?.ranked || []);
        }
      } catch {
        // initial load failed
      }
    }
    load();
  }, [slug, token]);

  async function refreshVotes() {
    try {
      const res = await fetch(
        `/api/polls/${encodeURIComponent(slug)}/votes?token=${encodeURIComponent(token)}`
      );
      if (res.ok) {
        const data = await res.json();
        setVotes(data.votes || []);
        setRanked(data.summary?.ranked || []);
      }
    } catch {
      // fetch failed
    }
  }

  async function saveConfig() {
    setConfigStatus("saving");
    setErrorMsg("");
    try {
      const body: Record<string, unknown> = { title, description, votingStyle };
      if (pollType === "date") {
        body.dates = dates;
      } else {
        body.options = options;
      }

      const res = await fetch(
        `/api/polls/${encodeURIComponent(slug)}/config?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (res.ok) {
        setConfigStatus("saved");
        setTimeout(() => setConfigStatus("idle"), 2000);
      } else {
        const data = await res.json().catch(() => null);
        setErrorMsg(data?.error || `${res.status} ${res.statusText}`);
        setConfigStatus("error");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Network error");
      setConfigStatus("error");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/polls/${encodeURIComponent(slug)}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        router.push("/");
      }
    } catch {
      // delete failed
    } finally {
      setDeleting(false);
    }
  }

  function cellIcon(value: VoteValue | undefined) {
    if (value === "yes") return { text: "\u2713", cls: "cell-yes" };
    if (value === "maybe") return { text: "?", cls: "cell-maybe" };
    if (value === "no") return { text: "\u2717", cls: "cell-no" };
    return { text: "\u2013", cls: "cell-none" };
  }

  // Items for the results table
  const itemKeys = pollType === "date" ? dates : options.map((o) => o.id);
  const itemLabels = pollType === "date"
    ? dates.map((d) => formatDate(d))
    : options.map((o) => o.title);

  // Group for date polls
  const weekGroups =
    pollType === "date"
      ? dates.reduce<Record<number, { keys: string[]; labels: string[] }>>((groups, date, i) => {
          const week = getIsoWeek(date);
          if (!groups[week]) groups[week] = { keys: [], labels: [] };
          groups[week].keys.push(date);
          groups[week].labels.push(itemLabels[i]);
          return groups;
        }, {})
      : { 0: { keys: itemKeys, labels: itemLabels } };

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">ADMIN — {title || slug}</p>

      <div className="admin-section">
        <h2>SHARE LINK</h2>
        <div className="share-link">
          <code>{pollUrl}</code>
          <button
            className="btn-primary btn-small"
            onClick={() => navigator.clipboard.writeText(pollUrl)}
          >
            COPY
          </button>
        </div>
      </div>

      <div className="admin-section">
        <h2>CONFIGURATION</h2>

        <div className="form-group">
          <label>Poll Type</label>
          <div className="type-badge">{pollType === "date" ? "DATE POLL" : "OPTION POLL"}</div>
        </div>

        <div className="form-group">
          <label>Event Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </div>

        <div className="form-group">
          <label>Voting Style</label>
          <VotingStyleSelector value={votingStyle} onChange={setVotingStyle} />
        </div>

        {pollType === "date" ? (
          <>
            <div className="form-group">
              <label>Select Dates</label>
              <CalendarPicker selected={dates} onChange={setDates} />
            </div>
            {dates.length > 0 && (
              <div className="date-chips">
                {dates.map((date) => (
                  <span key={date} className="date-chip">
                    {formatDate(date)}
                    <button onClick={() => setDates(dates.filter((d) => d !== date))}>&times;</button>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="form-group">
            <label>Options ({options.length}/30)</label>
            <OptionEditor options={options} onChange={setOptions} />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            className="btn-primary"
            onClick={saveConfig}
            disabled={configStatus === "saving"}
          >
            {configStatus === "saving" ? "SAVING..." : "SAVE CONFIG"}
          </button>
          {configStatus === "saved" && (
            <span className="success" style={{ marginLeft: 12 }}>SAVED</span>
          )}
          {configStatus === "error" && (
            <span className="error" style={{ marginLeft: 12 }}>{errorMsg || "SAVE FAILED"}</span>
          )}
        </div>
      </div>

      <div className="admin-section">
        <h2>RESULTS</h2>

        <div className="refresh-row">
          <span className="response-count">
            {votes.length} {votes.length === 1 ? "RESPONSE" : "RESPONSES"}
          </span>
          <button className="btn-primary btn-small" onClick={refreshVotes}>REFRESH</button>
        </div>

        {votes.length > 0 && ranked.length > 0 && (
          votingStyle === "yes-maybe-no" ? (
            <div className="scoreboard">
              {ranked.map((entry, i) => {
                const total = votes.length;
                const score = entry.score ?? 0;
                const barPct = total > 0 ? (score / total) * 100 : 0;
                const yesPct = total > 0 ? ((entry.yesCount ?? 0) / total) * 100 : 0;
                const topScore = ranked[0]?.yesCount ?? 0;
                return (
                  <div
                    key={entry.id}
                    className={`scoreboard-row${(entry.yesCount ?? 0) === topScore && topScore > 0 ? " scoreboard-top" : ""}`}
                  >
                    <span className="scoreboard-rank">{i + 1}</span>
                    <span className="scoreboard-date">
                      {pollType === "date" ? formatDate(entry.id) : entry.title}
                    </span>
                    <span className="scoreboard-bar-track">
                      <span className="scoreboard-bar-yes" style={{ width: `${yesPct}%` }} />
                      {barPct > yesPct && (
                        <span className="scoreboard-bar-meh" style={{ width: `${barPct - yesPct}%` }} />
                      )}
                    </span>
                    <span className="scoreboard-count">
                      {entry.yesCount} YES
                      {(entry.maybeCount ?? 0) > 0 && (
                        <span className="scoreboard-maybe"> / {entry.maybeCount} MEH</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <BarChart
              items={ranked.map((r) => ({
                label: pollType === "date" ? formatDate(r.id) : r.title,
                count: r.voteCount,
              }))}
            />
          )
        )}

        {votes.length === 0 ? (
          <p style={{ color: "#9090a0", letterSpacing: 2 }}>No responses yet</p>
        ) : (
          Object.entries(weekGroups).map(([week, group]) => {
            const counts = group.keys.map(
              (key) => votes.filter((v) => v.votes[key] === "yes").length
            );
            const maxCount = Math.max(...counts, 0);
            return (
              <div key={week} style={{ marginBottom: 20 }}>
                {pollType === "date" && <div className="week-label">W{week}</div>}
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>NAME</th>
                        {group.labels.map((label, i) => (
                          <th key={group.keys[i]}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {votes.map((vote) => (
                        <tr key={vote.name}>
                          <td>{vote.name}</td>
                          {group.keys.map((key) => {
                            if (votingStyle === "yes-maybe-no") {
                              const { text, cls } = cellIcon(vote.votes[key]);
                              return <td key={key} className={cls}>{text}</td>;
                            }
                            const selected = vote.votes[key] === "yes";
                            return (
                              <td key={key} className={selected ? "cell-yes" : "cell-none"}>
                                {selected ? "\u2713" : "\u2013"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="summary-row">
                        <td>TOTAL</td>
                        {group.keys.map((key, i) => (
                          <td
                            key={key}
                            className={maxCount > 0 && counts[i] === maxCount ? "best-date" : ""}
                          >
                            {counts[i]}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="admin-section">
        <h2>DANGER ZONE</h2>
        <p style={{ color: "#9090a0", letterSpacing: 1, marginBottom: 12, fontSize: 14 }}>
          Delete this poll and all its votes permanently.
        </p>
        {!deleteConfirm ? (
          <button
            className="btn-primary btn-danger"
            onClick={() => setDeleteConfirm(true)}
            disabled={deleting}
          >
            DELETE POLL
          </button>
        ) : (
          <div className="wipe-confirm">
            <span style={{ color: "#ff4466", letterSpacing: 1 }}>ARE YOU SURE?</span>
            <button
              className="btn-primary btn-danger"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "DELETING..." : "YES, DELETE"}
            </button>
            <button className="btn-primary btn-small" onClick={() => setDeleteConfirm(false)}>
              CANCEL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
