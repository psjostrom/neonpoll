"use client";

import { useState } from "react";
import type { PollOption } from "@/lib/types";
import { generateOptionId } from "@/lib/types";

export function OptionEditor({
  options,
  onChange,
}: {
  options: PollOption[];
  onChange: (options: PollOption[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleAdd() {
    if (!title.trim() || options.length >= 30) return;
    onChange([
      ...options,
      {
        id: generateOptionId(),
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      },
    ]);
    setTitle("");
    setDescription("");
  }

  function handleRemove(id: string) {
    onChange(options.filter((o) => o.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div>
      <div className="option-add-form">
        <input
          type="text"
          placeholder="Option title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={200}
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={1}
        />
        <button
          className="btn-primary btn-small"
          onClick={handleAdd}
          disabled={!title.trim() || options.length >= 30}
          type="button"
        >
          ADD
        </button>
      </div>

      {options.length > 0 && (
        <div className="option-list">
          {options.map((opt, i) => (
            <div key={opt.id} className="option-item">
              <span className="option-num">{i + 1}</span>
              <div className="option-info">
                <span className="option-title">{opt.title}</span>
                {opt.description && (
                  <span className="option-desc">{opt.description}</span>
                )}
              </div>
              <button
                className="option-remove"
                onClick={() => handleRemove(opt.id)}
                type="button"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
