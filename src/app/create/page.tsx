"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPicker } from "@/app/components/CalendarPicker";
import { formatDate } from "@/lib/types";

export default function CreatePollPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/--+/g, "-");
    setSlug(cleaned);
    setSlugStatus("idle");
  }

  async function checkSlug() {
    if (slug.length < 3) return;
    setSlugStatus("checking");
    try {
      const res = await fetch(`/api/polls/${encodeURIComponent(slug)}/config`);
      setSlugStatus(res.status === 404 ? "available" : "taken");
    } catch {
      setSlugStatus("idle");
    }
  }

  async function handleCreate() {
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, description, dates }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        setCreating(false);
        return;
      }
      const data = await res.json();
      router.push(`/p/${data.slug}/admin?token=${encodeURIComponent(data.adminToken)}`);
    } catch {
      setError("Network error. Try again.");
      setCreating(false);
    }
  }

  return (
    <div className="container">
      <div className="sun" />
      <h1 className="title">NEONPOLL</h1>
      <p className="subtitle">CREATE A NEW POLL</p>

      <div className="admin-section" style={{ marginTop: 20 }}>
        <div className="form-group">
          <label>Event Title</label>
          <input
            type="text"
            placeholder="Friday dinner?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label>Poll URL Slug</label>
          <input
            type="text"
            placeholder="friday-dinner"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            onBlur={checkSlug}
            maxLength={50}
          />
          {slugStatus === "checking" && (
            <span className="slug-status" style={{ color: "#9090a0" }}>Checking...</span>
          )}
          {slugStatus === "available" && (
            <span className="slug-status success">Available</span>
          )}
          {slugStatus === "taken" && (
            <span className="slug-status error">Already taken</span>
          )}
          {slug && (
            <span className="slug-preview">
              neonpoll.vercel.app/p/{slug}
            </span>
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

        <div style={{ marginTop: 16 }}>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={creating || !title.trim() || slug.length < 3 || dates.length === 0}
          >
            {creating ? "CREATING..." : "CREATE POLL"}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
