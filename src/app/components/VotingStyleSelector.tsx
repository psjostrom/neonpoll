"use client";

import type { VotingStyle } from "@/lib/types";

const STYLES: { value: VotingStyle; label: string; desc: string }[] = [
  { value: "yes-maybe-no", label: "YES / MAYBE / NO", desc: "Three-state per option" },
  { value: "single-choice", label: "SINGLE CHOICE", desc: "Pick exactly one" },
  { value: "multi-select", label: "MULTI-SELECT", desc: "Check all that apply" },
];

export function VotingStyleSelector({
  value,
  onChange,
}: {
  value: VotingStyle;
  onChange: (style: VotingStyle) => void;
}) {
  return (
    <div className="style-selector">
      {STYLES.map((s) => (
        <button
          key={s.value}
          className={`style-btn${value === s.value ? " style-active" : ""}`}
          onClick={() => onChange(s.value)}
          type="button"
        >
          <span className="style-label">{s.label}</span>
          <span className="style-desc">{s.desc}</span>
        </button>
      ))}
    </div>
  );
}
