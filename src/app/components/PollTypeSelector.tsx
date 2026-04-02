"use client";

import type { PollType } from "@/lib/types";

export function PollTypeSelector({
  value,
  onChange,
}: {
  value: PollType;
  onChange: (type: PollType) => void;
}) {
  return (
    <div className="type-selector">
      <button
        className={`type-btn${value === "date" ? " type-active" : ""}`}
        onClick={() => onChange("date")}
        type="button"
      >
        DATE POLL
      </button>
      <button
        className={`type-btn${value === "option" ? " type-active" : ""}`}
        onClick={() => onChange("option")}
        type="button"
      >
        OPTION POLL
      </button>
    </div>
  );
}
