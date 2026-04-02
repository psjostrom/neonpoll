"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PollSummary, PollType, VotingStyle, PollOption } from "@/lib/types";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { PollTypeSelector } from "@/app/components/PollTypeSelector";
import { VotingStyleSelector } from "@/app/components/VotingStyleSelector";
import { OptionEditor } from "@/app/components/OptionEditor";
import { formatDate } from "@/lib/types";

export function GlobalAdmin({ token }: { token: string }) {
  const router = useRouter();
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [pollType, setPollType] = useState<PollType>("date");
  const [votingStyle, setVotingStyle] = useState<VotingStyle>("yes-maybe-no");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [options, setOptions] = useState<PollOption[]>([]);
  const [rankCount, setRankCount] = useState(3);
  const [rankWeighted, setRankWeighted] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    loadPolls();
  }, [token]);

  async function loadPolls() {
    try {
      const res = await fetch(`/api/polls?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        setPolls(data.polls || []);
      }
    } catch {
      // fetch failed
    } finally {
      setLoading(false);
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-"));
  }

  const canCreate =
    title.trim() &&
    slug.length >= 3 &&
    (pollType === "date" ? dates.length > 0 : options.length >= 2);

  async function handleCreate() {
    setCreateError("");
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        type: pollType,
        votingStyle,
        slug,
        title,
        description,
      };
      if (pollType === "date") {
        body.dates = dates;
        body.options = [];
      } else {
        body.options = options.map((o) => ({
          title: o.title,
          ...(o.description ? { description: o.description } : {}),
        }));
        body.dates = [];
      }
      if (votingStyle === "ranked") {
        body.rankCount = rankCount;
        body.rankWeighted = rankWeighted;
      }

      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }
      const data = await res.json();
      router.push(data.adminUrl);
    } catch {
      setCreateError("Network error. Try again.");
      setCreating(false);
    }
  }

  async function handleDelete(pollSlug: string) {
    if (!confirm(`Delete poll "${pollSlug}" and all its votes?`)) return;
    try {
      const res = await fetch(
        `/api/polls/${encodeURIComponent(pollSlug)}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setPolls((prev) => prev.filter((p) => p.slug !== pollSlug));
      }
    } catch {
      // delete failed
    }
  }

  function typeBadge(type: PollType) {
    return type === "date" ? "DATE" : "OPTION";
  }

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">GLOBAL ADMIN</p>

      <div className="admin-section">
        <h2>ALL POLLS</h2>
        {loading ? (
          <p className="loading">LOADING...</p>
        ) : polls.length === 0 ? (
          <p style={{ color: "#9090a0", letterSpacing: 2 }}>No polls yet</p>
        ) : (
          <div className="poll-list">
            {polls.map((poll) => (
              <div key={poll.slug} className="poll-list-item">
                <div className="poll-list-info">
                  <Link
                    href={`/p/${poll.slug}/admin?token=${encodeURIComponent(token)}`}
                    className="poll-list-title"
                  >
                    <span className="poll-type-tag">{typeBadge(poll.type)}</span>
                    {poll.title}
                  </Link>
                  <span className="poll-list-meta">
                    /p/{poll.slug} — {poll.itemCount} {poll.type === "date" ? "dates" : "options"} — {poll.voteCount} votes
                  </span>
                </div>
                <button
                  className="btn-primary btn-small btn-danger"
                  onClick={() => handleDelete(poll.slug)}
                >
                  DELETE
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-section">
        {!showCreate ? (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            CREATE NEW POLL
          </button>
        ) : (
          <>
            <h2>CREATE NEW POLL</h2>

            <div className="form-group">
              <label>Poll Type</label>
              <PollTypeSelector value={pollType} onChange={setPollType} />
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
              <label>Slug</label>
              <input
                type="text"
                placeholder={pollType === "date" ? "friday-dinner" : "team-activity"}
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                maxLength={50}
              />
              {slug && <span className="slug-preview">/p/{slug}</span>}
            </div>

            <div className="form-group">
              <label>Description (optional)</label>
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

            {votingStyle === "ranked" && (
              <div className="form-group">
                <label>Number of Picks</label>
                <div className="rank-config">
                  <input
                    type="number"
                    min={1}
                    max={pollType === "date" ? Math.max(dates.length, 1) : Math.max(options.length, 2)}
                    value={rankCount}
                    onChange={(e) => setRankCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="rank-count-input"
                  />
                  <div className="rank-weight-toggle">
                    <button
                      className={`style-btn${rankWeighted ? " style-active" : ""}`}
                      onClick={() => setRankWeighted(true)}
                      type="button"
                    >
                      <span className="style-label">WEIGHTED</span>
                      <span className="style-desc">1st worth more</span>
                    </button>
                    <button
                      className={`style-btn${!rankWeighted ? " style-active" : ""}`}
                      onClick={() => setRankWeighted(false)}
                      type="button"
                    >
                      <span className="style-label">EQUAL</span>
                      <span className="style-desc">All picks same</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

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

            <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !canCreate}
              >
                {creating ? "CREATING..." : "CREATE"}
              </button>
              <button
                className="btn-primary btn-small"
                onClick={() => setShowCreate(false)}
              >
                CANCEL
              </button>
            </div>
            {createError && <p className="error">{createError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
