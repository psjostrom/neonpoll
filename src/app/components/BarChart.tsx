"use client";

export function BarChart({
  items,
}: {
  items: { label: string; count: number }[];
}) {
  const maxCount = Math.max(...items.map((i) => i.count), 1);
  const topCount = items[0]?.count ?? 0;

  return (
    <div className="bar-chart">
      {items.map((item, i) => (
        <div
          key={i}
          className={`bar-row${item.count === topCount && topCount > 0 ? " bar-top" : ""}`}
        >
          <span className="bar-rank">{i + 1}</span>
          <span className="bar-label">{item.label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
          </span>
          <span className="bar-count">{item.count}</span>
        </div>
      ))}
    </div>
  );
}
