import React, { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { ChevronDown, ChevronUp, BarChart3, Database, Globe } from 'lucide-react'
import { Label } from '../../ui/primitives'

interface AllIndiaStatsCardProps {
  stats: any
  incidents?: any[]
  onSelectCity?: (city: string) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

const CITY_NAMES: Record<string, string> = {
  mumbai: 'Mum',
  pune: 'Pun',
  nagpur: 'Nag',
  delhi: 'Del',
  bengaluru: 'Blr',
  hyderabad: 'Hyd',
  guwahati: 'Guw',
}

export const AllIndiaStatsCard: React.FC<AllIndiaStatsCardProps> = ({
  stats,
  incidents,
  onSelectCity,
  isCollapsed: externalCollapsed = false,
  onToggleCollapse,
}) => {
  const [internalMinimized, setInternalMinimized] = useState<boolean>(false)

  if (!stats) return null

  const isCollapsed = externalCollapsed || internalMinimized

  const byCity = stats.by_city || {}
  const cityBarData = Object.entries(byCity).map(([key, val]: [string, any]) => {
    const cityIncidents = incidents
      ? incidents.filter(i => (i.city || '').toLowerCase() === key.toLowerCase())
      : null
    const highCount = cityIncidents
      ? cityIncidents.filter(i => (i.severity_level || '').toLowerCase() === 'high').length
      : (val.high_count || Math.round((val.incidents || 20) * 0.25))
    const incCount = cityIncidents ? cityIncidents.length : (val.incidents || val.incident_count || 0)

    return {
      city: key.toLowerCase(),
      name: CITY_NAMES[key.toLowerCase()] || key.slice(0, 3).toUpperCase(),
      high_count: highCount,
      incidents: incCount,
      events: val.total_events || 0,
      real: val.real || 0,
      synthetic: val.synthetic || 0,
    }
  })

  const realCount = stats.real_vs_synthetic?.real ?? 144
  const synthCount = stats.real_vs_synthetic?.synthetic ?? 3074
  const totalEvents = stats.total_events ?? (realCount + synthCount)
  const totalIncidents = incidents ? incidents.length : (stats.total_incidents ?? 1327)

  const pieData = [
    { name: 'Real', value: realCount, color: '#22c55e' },
    { name: 'Synthetic', value: synthCount, color: '#a855f7' },
  ]

  const realPct = Math.round((realCount / (totalEvents || 1)) * 100)
  const synthPct = 100 - realPct

  const handleCityClick = (cityId?: string) => {
    if (!cityId || !onSelectCity) return
    onSelectCity(cityId.toLowerCase())
  }

  // When collapsed (e.g. incident card is open), show small glass pill above the ticker on bottom-left
  if (isCollapsed) {
    return (
      <div
        onClick={() => {
          if (onToggleCollapse) onToggleCollapse()
          else setInternalMinimized(false)
        }}
        className="absolute bottom-36 left-4 z-20 px-3.5 py-1.5 rounded-full bg-[var(--bg-panel)] backdrop-blur-2xl border border-[var(--border)] text-xs text-[var(--text)] flex items-center gap-2.5 shadow-2xl cursor-pointer hover:border-[var(--accent)] transition-all pointer-events-auto"
        title="Expand All India Intelligence"
      >
        <Globe className="w-3.5 h-3.5 text-[var(--accent)] stroke-[1.5]" />
        <span className="font-semibold text-xs">All India intel</span>
        <span className="text-[11px] text-[var(--text-muted)]">
          7 cities · {totalIncidents} incidents
        </span>
      </div>
    )
  }

  return (
    <div className="absolute bottom-16 right-4 z-20 w-80 bg-[var(--bg-panel)] backdrop-blur-2xl border border-[var(--border)] rounded-2xl shadow-2xl p-3.5 text-[var(--text)] pointer-events-auto transition-all duration-200">
      {/* Header with Minimize Toggle */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--accent)] stroke-[1.5]" />
          <div>
            <div className="text-[13px] font-semibold text-[var(--text)] flex items-center gap-2">
              <span>All India intelligence</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full border border-[var(--border)] text-[var(--text-muted)]">
                {totalIncidents} incidents
              </span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              7 cities · {totalEvents.toLocaleString()} events
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            if (onToggleCollapse) onToggleCollapse()
            else setInternalMinimized(true)
          }}
          className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <ChevronDown className="w-4 h-4 stroke-[1.5]" />
        </button>
      </div>

      <div className="space-y-3">
        {/* 1. High Incidents Per City Bar Chart (Clicking a bar or label flies to that city) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
              <Label>High incidents per city</Label>
            </div>
            <Label>Click bar to fly</Label>
          </div>

          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cityBarData}
                margin={{ top: 2, right: 2, left: -28, bottom: 0 }}
                onClick={(state: any) => {
                  const c = state?.activePayload?.[0]?.payload?.city
                  handleCityClick(c)
                }}
              >
                <XAxis
                  dataKey="name"
                  stroke="#8b93a1"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={(props: any) => {
                    const { x, y, payload } = props
                    const match = cityBarData.find(d => d.name === payload.value)
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text
                          x={0}
                          y={0}
                          dy={10}
                          textAnchor="middle"
                          fill="#8b93a1"
                          fontSize={10}
                          className="cursor-pointer hover:fill-[#22d3ee] transition-colors"
                          onClick={(e: any) => {
                            e.stopPropagation()
                            if (match?.city) handleCityClick(match.city)
                          }}
                        >
                          {payload.value}
                        </text>
                      </g>
                    )
                  }}
                />
                <YAxis stroke="#8b93a1" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)', cursor: 'pointer' }}
                  contentStyle={{
                    backgroundColor: 'rgba(12, 16, 24, 0.95)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    fontSize: 11,
                    padding: '4px 8px',
                    color: '#e6e8eb',
                  }}
                  labelStyle={{ color: '#22d3ee', fontWeight: 600 }}
                  formatter={(val: any) => [`${val} High incidents`, 'Severity']}
                />
                <Bar
                  dataKey="high_count"
                  fill="var(--sev-high)"
                  radius={[3, 3, 0, 0]}
                  className="cursor-pointer"
                  onClick={(entry: any) => {
                    const c = entry?.payload?.city || entry?.city
                    handleCityClick(c)
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Real vs Synthetic Donut */}
        <div className="pt-2 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
              <Label>Real vs synthetic telemetry</Label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            {/* Donut Chart */}
            <div className="w-20 h-20 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    innerRadius={22}
                    outerRadius={34}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    <Cell fill="#22c55e" />
                    <Cell fill="#a855f7" />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(12, 16, 24, 0.95)',
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      fontSize: 11,
                      padding: '4px 8px',
                      color: '#e6e8eb',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-[11px] font-semibold text-[var(--text)] leading-none">
                  {totalEvents}
                </span>
                <span className="text-[8px] text-[var(--text-muted)] tracking-tight">signals</span>
              </div>
            </div>

            {/* Legend & Breakdown */}
            <div className="flex-1 pl-3 space-y-1 text-xs">
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-[var(--border)]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--ok)] shrink-0" />
                  <span className="text-[11px] text-[var(--text)]">Real</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-[var(--text)]">{realCount}</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-1">({realPct}%)</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-[var(--border)]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                  <span className="text-[11px] text-[var(--text)]">Synthetic</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-[var(--text)]">{synthCount}</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-1">({synthPct}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
