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
        if (data.title && data.dates?.length > 0) {
          setConfig(data);
        }

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

  function toggleVote(date: string, value: VoteValue) {
    setVotes((prev) => {
      if (prev[date] === value) {
        const next = { ...prev };
        delete next[date];
        return next;
      }
      return { ...prev, [date]: value };
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
        <p className="subtitle" style={{ marginTop: 20 }}>
          POLL NOT FOUND
        </p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="container" style={{ paddingTop: "30vh" }}>
        <div className="sun" />
        <h1 className="title">NEONPOLL</h1>
        <p className="subtitle" style={{ marginTop: 20 }}>
          POLL NOT SET UP YET
        </p>
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
          <button
            className="btn-primary"
            onClick={() => setSubmitted(false)}
          >
            UPDATE RESPONSE
          </button>
        </div>
      </div>
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
              <a key={i} href={part} target="_blank" rel="noopener noreferrer">
                {part}
              </a>
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

      {Object.entries(
        config.dates.reduce<Record<number, string[]>>((groups, date) => {
          const week = getIsoWeek(date);
          (groups[week] ??= []).push(date);
          return groups;
        }, {})
      ).map(([week, weekDates]) => (
        <div key={week} className="week-group">
          <div className="week-label">W{week}</div>
          <div className="date-grid">
            {weekDates.map((date) => (
              <div key={date} className="date-card">
                <div className="date-label">{formatDate(date)}</div>
                <div className="vote-group">
                  {(["yes", "maybe", "no"] as VoteValue[]).map((v) => (
                    <button
                      key={v}
                      className={`vote-btn ${v}${votes[date] === v ? " active" : ""}`}
                      onClick={() => toggleVote(date, v)}
                    >
                      {v === "yes" ? "YES" : v === "maybe" ? "MEH" : "NO"}
                    </button>
                  ))}
                </div>
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
