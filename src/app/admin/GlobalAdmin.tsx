"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PollSummary } from "@/lib/types";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { formatDate } from "@/lib/types";

export function GlobalAdmin({ token }: { token: string }) {
  const router = useRouter();
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
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

  async function handleCreate() {
    setCreateError("");
    setCreating(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, description, dates }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }
      const data = await res.json();
      router.push(`/p/${data.slug}/admin?token=${encodeURIComponent(data.adminToken)}`);
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
                    {poll.title}
                  </Link>
                  <span className="poll-list-meta">
                    /p/{poll.slug} — {poll.dateCount} dates — {poll.voteCount} votes
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
                placeholder="friday-dinner"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                maxLength={50}
              />
              {slug && (
                <span className="slug-preview">/p/{slug}</span>
              )}
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

            <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating || !title.trim() || slug.length < 3 || dates.length === 0}
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
