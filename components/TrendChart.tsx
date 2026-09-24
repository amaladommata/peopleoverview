"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  label: string;
  exits: number;
  resignationsReceived: number | null;
  attritionPct: number;
}

// Trailing-12-months trend (PRD §7.3): exits + resignations as bars,
// attrition % as a line on a secondary axis. Data points/values are
// labeled directly on the chart (Recharts label props) per HRBP's request
// for an easily-readable chart, not just colored bars.
export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const hasResignationData = points.some((p) => p.resignationsReceived !== null);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={points} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7ebe9" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8a9691" }} axisLine={{ stroke: "#dbe2df" }} />
        <YAxis
          yAxisId="count"
          tick={{ fontSize: 11, fill: "#8a9691" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="pct"
          orientation="right"
          tick={{ fontSize: 11, fill: "#8a9691" }}
          axisLine={false}
          tickLine={false}
          unit="%"
        />
        <Tooltip
          formatter={(value: number, name: string) => (name === "Attrition %" ? `${value.toFixed(2)}%` : value)}
          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#dbe2df" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="count" dataKey="exits" name="Exits" fill="#ac4327" radius={[3, 3, 0, 0]} maxBarSize={22}>
        </Bar>
        {hasResignationData && (
          <Bar
            yAxisId="count"
            dataKey="resignationsReceived"
            name="Resignations Received"
            fill="#93650f"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
        )}
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="attritionPct"
          name="Attrition %"
          stroke="#0e6b62"
          strokeWidth={2}
          dot={{ r: 3, fill: "#0e6b62" }}
          label={{ fontSize: 10, fill: "#0e6b62", position: "top", formatter: (v: number) => `${v.toFixed(1)}%` }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
