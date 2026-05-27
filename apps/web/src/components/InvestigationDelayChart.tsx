import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DelayedTransactionGroup } from "@taicc/shared-types";
import { CHART, CHART_FONT, CHART_MARGIN } from "../lib/chart-theme";

const DELAY_COLORS: Record<string, string> = {
  approval_pending: "#78716c",
  policy_blocked: "#92400e",
  insufficient_balance: "#991b1b",
  failed_transfer: "#7f1d1d",
  network_delay: "#475569",
};

interface Props {
  groups: DelayedTransactionGroup[];
}

export function InvestigationDelayChart({ groups }: Props) {
  if (groups.length === 0) return null;

  const data = groups.map((g) => ({
    name: g.label,
    value: g.count,
    fill: DELAY_COLORS[g.reason] ?? "#6b7280",
  }));

  return (
    <div className="chart-panel investigation-chart">
      <div className="chart-panel-header">
        <h3>Investigation Scope</h3>
        <p className="chart-question">
          Which root causes account for the delayed payments in this run?
        </p>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(120, groups.length * 44)}>
        <BarChart data={data} layout="vertical" margin={CHART_MARGIN} barCategoryGap="20%">
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: CHART.axis, fontSize: 11, fontFamily: CHART_FONT }}
            axisLine={{ stroke: CHART.grid }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            tick={{ fill: CHART.label, fontSize: 11, fontFamily: CHART_FONT }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{
              background: CHART.tooltipBg,
              border: `1px solid ${CHART.tooltipBorder}`,
              borderRadius: 4,
              fontSize: 11,
            }}
            isAnimationActive={false}
          />
          <Bar dataKey="value" isAnimationActive={false} radius={[0, 2, 2, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="chart-source mono">
        Source: investigation delay_groups from POST /v1/workflows/delayed-payments/investigate
      </p>
    </div>
  );
}
