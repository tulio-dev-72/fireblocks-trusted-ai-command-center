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
import type { ChartDatum, OperationalChartData } from "../lib/operational-metrics";
import { CHART, CHART_FONT, CHART_MARGIN } from "../lib/chart-theme";

interface ChartPanelProps {
  title: string;
  question: string;
  data: ChartDatum[];
  emptyMessage: string;
  valueLabel?: string;
}

function OperationalBarChart({
  title,
  question,
  data,
  emptyMessage,
  valueLabel = "Count",
}: ChartPanelProps) {
  if (data.length === 0) {
    return (
      <div className="chart-panel">
        <div className="chart-panel-header">
          <h3>{title}</h3>
          <p className="chart-question">{question}</p>
        </div>
        <p className="chart-empty">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="chart-panel">
      <div className="chart-panel-header">
        <h3>{title}</h3>
        <p className="chart-question">{question}</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ ...CHART_MARGIN, left: 4 }}
          barCategoryGap="20%"
        >
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: CHART.axis, fontSize: 11, fontFamily: CHART_FONT }}
            axisLine={{ stroke: CHART.grid }}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={148}
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
              fontFamily: CHART_FONT,
            }}
            labelStyle={{ color: CHART.label }}
            formatter={(value) => [value ?? 0, valueLabel]}
            isAnimationActive={false}
          />
          <Bar dataKey="value" radius={[0, 2, 2, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type { OperationalChartData };

interface Props {
  data: OperationalChartData;
  loading?: boolean;
}

export function OperationalCharts({ data, loading }: Props) {
  if (loading) {
    return (
      <section className="panel operational-charts">
          <h2>Operational Telemetry</h2>
        <p className="loading">Loading from Fireblocks API…</p>
      </section>
    );
  }

  return (
    <section className="panel operational-charts">
      <div className="panel-header">
        <div>
          <span className="section-eyebrow">Operational Telemetry</span>
          <h2>Settlement, liquidity, and approval posture</h2>
          <p className="panel-desc">
            Aggregated from live Fireblocks API responses — same records used by treasury workflows.
          </p>
        </div>
        <span className="data-source-label mono">
          Source: GET /v1/transactions · /v1/balances · /v1/approvals (Fireblocks sandbox)
        </span>
      </div>

      <div className="charts-grid">
        <OperationalBarChart
          title="Settlement Pipeline"
          question="What is the current composition of transfer statuses?"
          data={data.settlement}
          emptyMessage="No transaction history available from Fireblocks."
        />
        <OperationalBarChart
          title="Delay Root Causes"
          question="What is blocking non-final payments right now?"
          data={data.delayCauses}
          emptyMessage="No delayed payments detected in the current sandbox history."
        />
        <OperationalBarChart
          title="Approval Queue"
          question="How many authorizations are pending vs resolved?"
          data={data.approvals}
          emptyMessage="No approval queue records available."
        />
        <OperationalBarChart
          title="Liquidity Concentration"
          question="Where is available vault liquidity concentrated by asset?"
          data={data.liquidity}
          emptyMessage="No positive available balances returned from Fireblocks."
          valueLabel="Available"
        />
        <OperationalBarChart
          title="Pending Transfer Age"
          question="How long have open transfers been unsettled?"
          data={data.pendingAge}
          emptyMessage="No timestamped non-final transactions to age."
        />
      </div>
    </section>
  );
}
