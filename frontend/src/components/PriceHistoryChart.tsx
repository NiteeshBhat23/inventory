import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money, shortDate } from '../lib/format'
import type { PriceHistoryPoint } from '../lib/types'

/** Isolated into its own lazy-loaded chunk (see Insights.tsx) so recharts —
 *  by far the heaviest dependency in the app — only downloads once someone
 *  actually opens the price-history chart, not on every Insights visit. */
export default function PriceHistoryChart({ points }: { points: PriceHistoryPoint[] }) {
  const dates = [...new Set(points.map((p) => p.date))].sort()
  const byDate = new Map(dates.map((d) => [d, { date: d } as { date: string; cost?: number; selling?: number }]))
  for (const p of points) {
    const row = byDate.get(p.date)!
    row[p.kind === 'cost' ? 'cost' : 'selling'] = p.value
  }
  const data = dates.map((d) => byDate.get(d)!)

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => shortDate(d)}
            stroke="var(--ink-subtle)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: 'var(--line)' }}
          />
          <YAxis
            tickFormatter={(v: number) => money(v)}
            stroke="var(--ink-subtle)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={64}
          />
          <Tooltip
            formatter={(value, name) => [money(Number(value)), name === 'cost' ? 'Cost' : 'Selling price']}
            labelFormatter={(d) => shortDate(String(d))}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              fontSize: 12,
              boxShadow: 'var(--shadow-raised)',
            }}
          />
          <Line
            type="stepAfter"
            dataKey="cost"
            name="cost"
            stroke="var(--brand)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--brand)' }}
            connectNulls
          />
          <Line
            type="stepAfter"
            dataKey="selling"
            name="selling"
            stroke="var(--good)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--good)' }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
