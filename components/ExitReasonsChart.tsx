"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// A palette distinct from the teal brand accent / red-amber semantic
// colors used elsewhere — categorical, for an open-ended set of reason
// categories (PRD §7.4: derive the list from the data, never hardcode it).
const REASON_COLORS = ["#3f7d74", "#7986ab", "#b0763f", "#9c6a86", "#5c8a5c", "#a3785a", "#6b7a99"];

export interface ExitReasonMonth {
  label: string;
  total: number;
  // one key per reason category -> raw count for that month
  [reasonCategory: string]: string | number;
}

// Exit reasons trend (PRD §7.4), stacked as % of that month's exits rather
// than raw counts, per HRBP's request — the category with 4/6 exits in one
// month and 4/20 in another should not look the same height.
export default function ExitReasonsChart({
  points,
  categories,
}: {
  points: ExitReasonMonth[];
  categories: string[];
}) {
  const pctPoints = points.map((p) => {
    const row: ExitReasonMonth = { label: p.label, total: p.total };
    for (const cat of categories) {
      const raw = typeof p[cat] === "number" ? (p[cat] as number) : 0;
      row[cat] = p.total > 0 ? (raw / p.total) * 100 : 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={pctPoints} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7ebe9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8a9691" }} axisLine={{ stroke: "#dbe2df" }} />
        <YAxis
          tick={{ fontSize: 11, fill: "#8a9691" }}
          axisLine={false}
          tickLine={false}
          unit="%"
          domain={[0, 100]}
        />
        <Tooltip formatter={(value: number) => `${value.toFixed(0)}%`} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#dbe2df" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {categories.map((cat, i) => (
          <Bar
            key={cat}
            dataKey={cat}
            name={cat}
            stackId="reasons"
            fill={REASON_COLORS[i % REASON_COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
