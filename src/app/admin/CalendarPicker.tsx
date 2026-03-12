"use client";

import { useState } from "react";

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (firstDay + 6) % 7; // Monday-start
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

const MONTH_NAMES = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

const DAY_HEADERS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function getIsoWeek(year: number, month: number, day: number) {
  const date = new Date(year, month, day);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function CalendarPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (dates: string[]) => void;
}) {
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const selectedSet = new Set(selected);
  const cells = getCalendarDays(view.year, view.month);
  const today = new Date();
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  function toggleDate(day: number) {
    const iso = toIso(view.year, view.month, day);
    if (selectedSet.has(iso)) {
      onChange(selected.filter((d) => d !== iso));
    } else {
      onChange([...selected, iso].sort());
    }
  }

  function prevMonth() {
    setView((v) =>
      v.month === 0
        ? { year: v.year - 1, month: 11 }
        : { year: v.year, month: v.month - 1 }
    );
  }

  function nextMonth() {
    setView((v) =>
      v.month === 11
        ? { year: v.year + 1, month: 0 }
        : { year: v.year, month: v.month + 1 }
    );
  }

  return (
    <div className="cal-picker">
      <div className="cal-header">
        <button className="cal-nav" onClick={prevMonth}>&laquo;</button>
        <span className="cal-title">
          {MONTH_NAMES[view.month]} {view.year}
        </span>
        <button className="cal-nav" onClick={nextMonth}>&raquo;</button>
      </div>
      <div className="cal-grid cal-grid-wk">
        <span className="cal-day-header cal-wk-header">W</span>
        {DAY_HEADERS.map((d) => (
          <span key={d} className="cal-day-header">{d}</span>
        ))}
        {cells.map((day, i) => {
          const weekLabel = i % 7 === 0 ? (
            <span key={`w${i}`} className="cal-wk">
              {day !== null
                ? getIsoWeek(view.year, view.month, day)
                : getIsoWeek(
                    view.month === 0 ? view.year - 1 : view.year,
                    view.month === 0 ? 11 : view.month - 1,
                    new Date(view.year, view.month, 0).getDate()
                  )}
            </span>
          ) : null;

          if (day === null) {
            return [weekLabel, <span key={`e${i}`} />].filter(Boolean);
          }

          const iso = toIso(view.year, view.month, day);
          const isSelected = selectedSet.has(iso);
          const isToday = iso === todayIso;
          return [
            weekLabel,
            <button
              key={iso}
              className={`cal-day${isSelected ? " cal-selected" : ""}${isToday ? " cal-today" : ""}`}
              onClick={() => toggleDate(day)}
            >
              {day}
            </button>,
          ].filter(Boolean);
        })}
      </div>
    </div>
  );
}
