"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate, getIsoWeek } from "@/lib/types";
import type { PollConfig, Vote, VoteValue } from "@/lib/types";

export default function VotingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<PollConfig | null>(null);
  const [name, setName] = useState("");
  const [votes, setVotes] = useState<Record<string, VoteValue>>({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/polls/${encodeURIComponent(slug)}/config`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setConfig(data);

        const savedName = localStorage.getItem(`neonpoll-name-${slug}`);
        if (savedName) {
          setName(savedName);
          const voteRes = await fetch(
            `/api/polls/${encodeURIComponent(slug)}/vote?name=${encodeURIComponent(savedName)}`
          );
          if (voteRes.ok) {
            const prev: Vote = await voteRes.json();
            setVotes(prev.votes);
          }
        }
      } catch {
        // config fetch failed
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  async function handleSubmit() {
    setError("");
    try {
      const res = await fetch(`/api/polls/${encodeURIComponent(slug)}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), votes }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        return;
      }
      localStorage.setItem(`neonpoll-name-${slug}`, name.trim());
      setSubmitted(true);
    } catch {
      setError("Network error. Try again.");
    }
  }

  function toggleYesMaybeNo(key: string, value: VoteValue) {
    setVotes((prev) => {
      if (prev[key] === value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }

  function toggleSingleChoice(key: string) {
    setVotes((prev) => {
      if (prev[key] === "yes") {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { [key]: "yes" as VoteValue };
    });
  }

  function toggleMultiSelect(key: string) {
    setVotes((prev) => {
      if (prev[key] === "yes") {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: "yes" as VoteValue };
    });
  }

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: "40vh" }}>
        <p className="loading">LOADING...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="container" style={{ paddingTop: "30vh" }}>
        <div className="sun" />
        <h1 className="title">NEONPOLL</h1>
        <p className="subtitle" style={{ marginTop: 20 }}>POLL NOT FOUND</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container" style={{ paddingTop: "30vh" }}>
        <div className="sun" />
        <h1 className="title">NEONPOLL</h1>
        <p className="subtitle" style={{ marginTop: 20 }}>POLL NOT SET UP YET</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="container" style={{ paddingTop: "25vh" }}>
        <div className="sun" />
        <h1 className="thanks-heading">THANKS!</h1>
        <p className="subtitle">YOUR RESPONSE HAS BEEN RECORDED</p>
        <div className="submit-row" style={{ marginTop: 30 }}>
          <button className="btn-primary" onClick={() => setSubmitted(false)}>
            UPDATE RESPONSE
          </button>
        </div>
      </div>
    );
  }

  // Build items list
  const items =
    config.type === "date"
      ? config.dates.map((d) => ({ key: d, label: formatDate(d), desc: undefined as string | undefined, week: getIsoWeek(d) }))
      : config.options.map((o) => ({ key: o.id, label: o.title, desc: o.description, week: 0 }));

  // Group by week for date polls
  const grouped =
    config.type === "date"
      ? Object.entries(
          items.reduce<Record<number, typeof items>>((g, item) => {
            (g[item.week] ??= []).push(item);
            return g;
          }, {})
        )
      : [["0", items] as const];

  function renderVoteControls(key: string) {
    if (config!.votingStyle === "yes-maybe-no") {
      return (
        <div className="vote-group">
          {(["yes", "maybe", "no"] as VoteValue[]).map((v) => (
            <button
              key={v}
              className={`vote-btn ${v}${votes[key] === v ? " active" : ""}`}
              onClick={() => toggleYesMaybeNo(key, v)}
            >
              {v === "yes" ? "YES" : v === "maybe" ? "MEH" : "NO"}
            </button>
          ))}
        </div>
      );
    }
    if (config!.votingStyle === "single-choice") {
      return (
        <button
          className={`vote-toggle${votes[key] === "yes" ? " vote-toggle-active" : ""}`}
          onClick={() => toggleSingleChoice(key)}
        >
          {votes[key] === "yes" ? "SELECTED" : "SELECT"}
        </button>
      );
    }
    // multi-select
    return (
      <button
        className={`vote-toggle vote-toggle-multi${votes[key] === "yes" ? " vote-toggle-active" : ""}`}
        onClick={() => toggleMultiSelect(key)}
      >
        {votes[key] === "yes" ? "SELECTED" : "SELECT"}
      </button>
    );
  }

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">{config.title}</p>
      {config.description && (
        <p className="description">
          {config.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
            /^https?:\/\//.test(part) ? (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
            ) : (
              part
            )
          )}
        </p>
      )}

      <div className="name-input">
        <input
          type="text"
          placeholder="Enter your name..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
        />
      </div>

      {grouped.map(([week, weekItems]) => (
        <div key={week} className="week-group">
          {config.type === "date" && <div className="week-label">W{week}</div>}
          <div className="date-grid">
            {weekItems.map((item) => (
              <div key={item.key} className="date-card">
                <div className="date-label">{item.label}</div>
                {item.desc && <div className="option-card-desc">{item.desc}</div>}
                {renderVoteControls(item.key)}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="submit-row">
        <button
          className="btn-primary"
          disabled={!name.trim()}
          onClick={handleSubmit}
        >
          SUBMIT
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
