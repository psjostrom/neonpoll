"use client";

import { useEffect, useState } from "react";
import { formatDate, getIsoWeek } from "@/lib/types";
import type { PollConfig, Vote, VoteValue } from "@/lib/types";
import { CalendarPicker } from "./CalendarPicker";

export function AdminPanel({ token }: { token: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [configStatus, setConfigStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [configRes, votesRes] = await Promise.all([
          fetch("/api/config"),
          fetch(`/api/votes?token=${encodeURIComponent(token)}`),
        ]);

        if (configRes.ok) {
          const data: PollConfig = await configRes.json();
          setTitle(data.title || "");
          setDescription(data.description || "");
          setDates(data.dates || []);
        }

        if (votesRes.ok) {
          const data = await votesRes.json();
          setVotes(data.votes || []);
        }
      } catch {
        // initial load failed
      }
    }
    load();
  }, [token]);

  async function refreshVotes() {
    try {
      const res = await fetch(`/api/votes?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setVotes(data.votes || []);
      }
    } catch {
      // fetch failed
    }
  }

  async function saveConfig() {
    setConfigStatus("saving");
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/config?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, dates }),
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

  function cellIcon(value: VoteValue | undefined) {
    if (value === "yes") return { text: "\u2713", cls: "cell-yes" };
    if (value === "maybe") return { text: "?", cls: "cell-maybe" };
    if (value === "no") return { text: "\u2717", cls: "cell-no" };
    return { text: "\u2013", cls: "cell-none" };
  }

  const weekGroups = dates.reduce<Record<number, string[]>>((groups, date) => {
    const week = getIsoWeek(date);
    (groups[week] ??= []).push(date);
    return groups;
  }, {});

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">ADMIN PANEL</p>

      <div className="admin-section">
        <h2>CONFIGURATION</h2>

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

        <div style={{ marginTop: 16 }}>
          <button
            className="btn-primary"
            onClick={saveConfig}
            disabled={configStatus === "saving"}
          >
            {configStatus === "saving" ? "SAVING..." : "SAVE CONFIG"}
          </button>
          {configStatus === "saved" && (
            <span className="success" style={{ marginLeft: 12 }}>
              SAVED
            </span>
          )}
          {configStatus === "error" && (
            <span className="error" style={{ marginLeft: 12 }}>
              {errorMsg || "SAVE FAILED"}
            </span>
          )}
        </div>
      </div>

      <div className="admin-section">
        <h2>RESULTS</h2>

        <div className="refresh-row">
          <span className="response-count">
            {votes.length} {votes.length === 1 ? "RESPONSE" : "RESPONSES"}
          </span>
          <button className="btn-primary btn-small" onClick={refreshVotes}>
            REFRESH
          </button>
        </div>

        {votes.length > 0 && dates.length > 0 && (() => {
          const ranked = dates
            .map((date) => ({
              date,
              yes: votes.filter((v) => v.votes[date] === "yes").length,
              maybe: votes.filter((v) => v.votes[date] === "maybe").length,
            }))
            .sort((a, b) => b.yes - a.yes || b.maybe - a.maybe);
          const topYes = ranked[0].yes;
          return (
            <div className="scoreboard">
              {ranked.map((entry, i) => (
                <div
                  key={entry.date}
                  className={`scoreboard-row${entry.yes === topYes && topYes > 0 ? " scoreboard-top" : ""}`}
                >
                  <span className="scoreboard-rank">{i + 1}</span>
                  <span className="scoreboard-date">{formatDate(entry.date)}</span>
                  <span className="scoreboard-bar-track">
                    <span className="scoreboard-bar" style={{
                      width: `${topYes > 0 ? (entry.yes / topYes) * 100 : 0}%`,
                    }} />
                  </span>
                  <span className="scoreboard-count">
                    {entry.yes} YES
                    {entry.maybe > 0 && <span className="scoreboard-maybe"> / {entry.maybe} MEH</span>}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

        {votes.length === 0 ? (
          <p style={{ color: "#9090a0", letterSpacing: 2 }}>
            No responses yet
          </p>
        ) : (
          Object.entries(weekGroups).map(([week, weekDates]) => {
            const yesCounts = weekDates.map(
              (date) => votes.filter((v) => v.votes[date] === "yes").length
            );
            const maxYes = Math.max(...yesCounts, 0);
            return (
              <div key={week} style={{ marginBottom: 20 }}>
                <div className="week-label">W{week}</div>
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>NAME</th>
                        {weekDates.map((date) => (
                          <th key={date}>{formatDate(date)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {votes.map((vote) => (
                        <tr key={vote.name}>
                          <td>{vote.name}</td>
                          {weekDates.map((date) => {
                            const { text, cls } = cellIcon(vote.votes[date]);
                            return (
                              <td key={date} className={cls}>
                                {text}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="summary-row">
                        <td>TOTAL</td>
                        {weekDates.map((date, i) => (
                          <td
                            key={date}
                            className={
                              maxYes > 0 && yesCounts[i] === maxYes
                                ? "best-date"
                                : ""
                            }
                          >
                            {yesCounts[i]}
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
    </div>
  );
}
