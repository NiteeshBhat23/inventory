import { DownloadSimple, ChartBar } from '@phosphor-icons/react'
import { useState } from 'react'
import { api } from '../lib/apiClient'
import { useQuery } from '../lib/useQuery'
import { money } from '../lib/format'
import type { DashboardData } from '../lib/types'
import BackHeader from '../components/BackHeader'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { RankedList } from '../components/ui/RankedList'
import { EmptyState } from '../components/ui/EmptyState'
import { ListSkeleton } from '../components/ui/Skeleton'
import { SelectField } from '../components/ui/Field'
import { useToast } from '../components/ui/Toast'

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const toast = useToast()
  const [days, setDays] = useState(90)
  const [exporting, setExporting] = useState<'purchases' | 'sales' | null>(null)
  // Same cached endpoint the dashboard uses — switching between the two pages
  // at the same window is now a cache hit rather than a refetch.
  const { data, loading } = useQuery<DashboardData>(`/dashboard?days=${days}`)

  async function exportCsv(kind: 'purchases' | 'sales') {
    setExporting(kind)
    try {
      const csv = await api.get<string>(`/reports/${kind}.csv?days=${days}`)
      downloadCsv(`${kind}_last_${days}_days.csv`, csv)
      toast.success(`${kind === 'purchases' ? 'Purchase' : 'Sales'} history downloaded`)
    } catch {
      toast.error('Could not export — please try again')
    } finally {
      setExporting(null)
    }
  }

  const hasData =
    !!data &&
    (data.supplier_spend.length > 0 ||
      data.category_breakdown.length > 0 ||
      data.top_items_by_profit.length > 0)

  return (
    <div className="space-y-4">
      <BackHeader title="Reports" fallback="/" />

      <Card>
        <SelectField
          label="Period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          hint="Applies to every figure and export on this page"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </SelectField>
      </Card>

      <Card>
        <CardHeader
          title="Export"
          subtitle="Download raw records as a spreadsheet-ready CSV"
        />
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button
            variant="secondary"
            fullWidth
            loading={exporting === 'purchases'}
            icon={<DownloadSimple size={18} weight="bold" aria-hidden="true" />}
            onClick={() => exportCsv('purchases')}
          >
            Purchases
          </Button>
          <Button
            variant="secondary"
            fullWidth
            loading={exporting === 'sales'}
            icon={<DownloadSimple size={18} weight="bold" aria-hidden="true" />}
            onClick={() => exportCsv('sales')}
          >
            Sales
          </Button>
        </div>
      </Card>

      {loading && !data && <ListSkeleton rows={3} />}

      {data && !hasData && (
        <Card>
          <EmptyState
            icon={<ChartBar size={24} weight="duotone" />}
            title="Nothing to report yet"
            description="Once you've logged some purchases and sales, this page will break down where your money is going."
          />
        </Card>
      )}

      {data && hasData && (
        <>
          <RankedList
            title="Spend by supplier"
            subtitle="Who you buy from most"
            data={data.supplier_spend}
            format={money}
            emptyLabel="No purchases in this period."
            limit={8}
            linkFor={(d) => `/purchases/history?supplier=${encodeURIComponent(d.name)}`}
          />
          <RankedList
            title="Most profitable items"
            subtitle="Where your margin actually comes from"
            data={data.top_items_by_profit}
            format={money}
            emptyLabel="No sales in this period."
            limit={8}
            linkFor={(d) => `/inventory?q=${encodeURIComponent(d.name)}`}
          />
          <RankedList
            title="Stock value by category"
            subtitle="Where your money is tied up"
            data={data.category_breakdown}
            format={money}
            emptyLabel="No items yet."
            limit={8}
            linkFor={(d) => `/inventory?category=${encodeURIComponent(d.name)}`}
          />
        </>
      )}
    </div>
  )
}
