import React, { useState, useEffect, useRef } from 'react'
import {
  X,
  Radio,
  FileText,
  Search,
  Flame,
  Hospital,
  Train,
  BarChart3,
  TrendingUp,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
} from 'recharts'
import { motion } from 'framer-motion'
import { type V1Incident, fetchV1Incident } from '../../api'
import { formatSourceType, formatCause } from '../../utils/formatters'

interface IncidentCardProps {
  incident: V1Incident | null
  onClose: () => void
  onOpenReplay?: () => void
  highlightedEventId?: string | null
  onSelectEvent?: (eventId: string) => void
}

type TabKey = 'summary' | 'cause' | 'trend' | 'evidence' | 'briefing'

function toShortChip(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('weather') || lower.includes('doppler')) return 'No Weather Radar'
  if (lower.includes('few') || lower.includes('sources')) return 'Few Modalities'
  if (lower.includes('sensor confirmation') || lower.includes('no direct')) return 'No IoT Gauge'
  if (lower.includes('conflict') || lower.includes('disput')) return 'Conflicting Reports'
  if (lower.includes('untrusted') || lower.includes('unverified') || lower.includes('spoof')) return 'Untrusted Telemetry'
  if (lower.includes('prior') || lower.includes('ceiling')) return 'Bayesian Prior'
  return text.split(' ').slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function getEventIconAndColor(type: string): { icon: string; bg: string; border: string; text: string; hex: string } {
  const t = (type || '').toLowerCase()
  if (t.includes('water')) {
    return { icon: '💧', bg: 'bg-cyan-500/20', border: 'border-cyan-400', text: 'text-cyan-300', hex: '#06b6d4' }
  }
  if (t.includes('road')) {
    return { icon: '🚗', bg: 'bg-amber-500/20', border: 'border-amber-400', text: 'text-amber-300', hex: '#f59e0b' }
  }
  if (t.includes('transit')) {
    return { icon: '🚌', bg: 'bg-purple-500/20', border: 'border-purple-400', text: 'text-purple-300', hex: '#a855f7' }
  }
  if (t.includes('call') || t.includes('emergency')) {
    return { icon: '📞', bg: 'bg-rose-500/20', border: 'border-rose-400', text: 'text-rose-300', hex: '#ef4444' }
  }
  if (t.includes('citizen')) {
    return { icon: '👤', bg: 'bg-emerald-500/20', border: 'border-emerald-400', text: 'text-emerald-300', hex: '#10b981' }
  }
  if (t.includes('weather') || t.includes('rain')) {
    return { icon: '🌧', bg: 'bg-sky-500/20', border: 'border-sky-400', text: 'text-sky-300', hex: '#0284c7' }
  }
  return { icon: '📡', bg: 'bg-slate-500/20', border: 'border-slate-400', text: 'text-slate-300', hex: '#64748b' }
}

function checkIsLate(eventTime?: string, receivedTime?: string): boolean {
  if (!eventTime || !receivedTime) return false
  const t1 = new Date(eventTime).getTime()
  const t2 = new Date(receivedTime).getTime()
  if (isNaN(t1) || isNaN(t2)) return false
  return (t2 - t1) > 5 * 60 * 1000 // > 5 minutes
}

export const IncidentCard: React.FC<IncidentCardProps> = ({
  incident,
  onClose,
  onOpenReplay,
  highlightedEventId,
  onSelectEvent,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [causeMode, setCauseMode] = useState<'combined' | 'rules' | 'ml'>('combined')
  const [isSummaryExpanded, setIsSummaryExpanded] = useState<boolean>(false)
  const eventListRef = useRef<HTMLDivElement>(null)

  // Switch to evidence tab automatically if an event is highlighted
  useEffect(() => {
    if (highlightedEventId) {
      setActiveTab('evidence')
    }
  }, [highlightedEventId])

  const [loadedEvents, setLoadedEvents] = useState<any[]>(incident?.events || [])

  useEffect(() => {
    if (incident?.events && incident.events.length > 0) {
      setLoadedEvents(incident.events)
    } else if (incident?.incident_id) {
      fetchV1Incident(incident.incident_id).then(full => {
        if (full && full.events && full.events.length > 0) {
          setLoadedEvents(full.events)
        }
      }).catch(() => {})
    }
  }, [incident?.incident_id, incident?.events])

  if (!incident) return null

  const confPercent = Math.round((incident.cause_confidence || 0) * 100)
  const sevColor =
    (incident.severity_level || 'Medium').toLowerCase() === 'high'
      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      : (incident.severity_level || 'Medium').toLowerCase() === 'medium'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'

  // Short title: max 4 words, full in tooltip
  const titleWords = incident.title.split(' ')
  const shortTitle = titleWords.slice(0, 4).join(' ') + (titleWords.length > 4 ? '…' : '')

  // Circular confidence ring
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (confPercent / 100) * circumference

  // Cause ranking selection
  const rawRanking =
    causeMode === 'rules' && incident.cause_ranking_rules
      ? incident.cause_ranking_rules
      : causeMode === 'ml' && incident.cause_ranking_ml
      ? incident.cause_ranking_ml
      : incident.cause_ranking || []

  const chartRanking = rawRanking.slice(0, 4).map(item => {
    const friendly = formatCause(item.cause) || item.label
    const shortName = friendly.replace(/^[^\w\s]+/, '').trim().split('/')[0].trim().slice(0, 14)
    return {
      name: shortName,
      fullLabel: friendly,
      probability: Math.round((item.probability || 0) * 100),
    }
  })

  // Trend data
  const trendData = (incident as any).confidence_history
    ? (incident as any).confidence_history.map((h: any) => ({
        time: h.t,
        confidence: Math.round((h.confidence || 0) * 100),
      }))
    : [
        { time: 'T-40m', confidence: Math.max(20, Math.round(confPercent * 0.4)) },
        { time: 'T-30m', confidence: Math.max(35, Math.round(confPercent * 0.6)) },
        { time: 'T-20m', confidence: Math.max(50, Math.round(confPercent * 0.78)) },
        { time: 'T-10m', confidence: Math.max(65, Math.round(confPercent * 0.92)) },
        { time: 'Now', confidence: confPercent },
      ]

  const rainData = [
    { time: '08:00', rain: 15 },
    { time: '10:00', rain: 38 },
    { time: '12:00', rain: 92 },
    { time: '14:00', rain: 112 },
    { time: 'Now', rain: 84 },
  ]

  const events = (incident.events && incident.events.length > 0) ? incident.events : loadedEvents
  const eventCount = events.length

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="absolute top-4 right-4 z-20 w-84 sm:w-96 bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-white pointer-events-auto flex flex-col max-h-[92vh]"
    >
      {/* 1. Header with Confidence Ring, Severity Chip, Short Title */}
      <div className="p-3.5 border-b border-white/10 bg-white/5 flex-shrink-0">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Confidence Ring */}
            <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
              <svg className="w-10 h-10 transform -rotate-90">
                <circle
                  cx="20"
                  cy="20"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-white/10"
                  fill="transparent"
                />
                <circle
                  cx="20"
                  cy="20"
                  r={radius}
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className={confPercent >= 75 ? 'text-emerald-400' : confPercent >= 50 ? 'text-amber-400' : 'text-rose-400'}
                  fill="transparent"
                />
              </svg>
              <span className="absolute text-[10px] font-mono font-bold">{confPercent}%</span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] font-mono text-cyan-400">{incident.incident_id}</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded-full border font-bold capitalize ${sevColor}`}>
                  {incident.severity_level || 'Medium'}
                </span>
              </div>
              <h2
                className="text-xs font-bold text-slate-100 truncate cursor-help"
                title={incident.title}
              >
                {shortTitle}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary: max 1 line, "Read more" expands */}
        <div className="mt-2.5 p-2 rounded-xl bg-slate-900/80 border border-white/10 text-[11px] text-slate-200 leading-relaxed">
          <div className={isSummaryExpanded ? '' : 'line-clamp-1'}>
            💡 {incident.summary || incident.explanation || 'Hypothesis correlated across multimodal streaming feeds.'}
          </div>
          <button
            onClick={() => setIsSummaryExpanded(prev => !prev)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold mt-1 flex items-center gap-0.5"
          >
            <span>{isSummaryExpanded ? 'Show less' : 'Read more'}</span>
            {isSummaryExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* 2. Tabs Bar */}
      <div className="flex items-center border-b border-white/10 bg-black/20 text-xs px-2 flex-shrink-0">
        {[
          { key: 'summary', label: 'Summary', icon: HelpCircle },
          { key: 'cause', label: 'Cause', icon: BarChart3 },
          { key: 'trend', label: 'Trend', icon: TrendingUp },
          { key: 'evidence', label: 'Evidence', icon: Radio },
          { key: 'briefing', label: 'Briefing', icon: FileText },
        ].map(t => {
          const Icon = t.icon
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as TabKey)}
              className={`flex-1 py-2 flex items-center justify-center gap-1 border-b-2 font-medium text-[11px] transition-colors ${
                isActive
                  ? 'border-cyan-400 text-cyan-300 font-bold bg-white/5'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* 3. Tab Contents */}
      <div className="p-3.5 overflow-y-auto space-y-3.5 flex-1 text-xs">
        {/* TAB 1: SUMMARY */}
        {activeTab === 'summary' && (
          <div className="space-y-3">
            {/* Why not 100% as small red chips */}
            {incident.why_not_higher && incident.why_not_higher.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  Confidence Gaps
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {incident.why_not_higher.map((reason, idx) => (
                    <span
                      key={idx}
                      title={reason}
                      className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-semibold"
                    >
                      {toShortChip(reason)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Check next: one icon + label chip */}
            {incident.check_next && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  Check Next
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 text-[11px] font-semibold">
                  <Search className="w-3 h-3 text-cyan-400" />
                  <span>{formatSourceType(incident.check_next)}</span>
                </div>
              </div>
            )}

            {/* Severity Factors as chips */}
            {incident.severity_factors && incident.severity_factors.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Severity Drivers
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {incident.severity_factors.map((factor, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-[10px] text-slate-200"
                    >
                      {factor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Nearest Help as 3 Icon Rows with Distance Badges */}
            {incident.nearest_infrastructure && (
              <div className="space-y-1.5 pt-1.5 border-t border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Nearest Help ({incident.city || 'Sector'})
                </div>
                <div className="space-y-1">
                  {incident.nearest_infrastructure.hospital && (
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-white/5 text-[11px]">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Hospital className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                        <span className="truncate font-medium text-slate-200">{incident.nearest_infrastructure.hospital.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold px-1.5 py-0.2 rounded bg-emerald-950/40 border border-emerald-500/30 flex-shrink-0">
                        {incident.nearest_infrastructure.hospital.distance_km} km
                      </span>
                    </div>
                  )}

                  {incident.nearest_infrastructure.fire_station && (
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-white/5 text-[11px]">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Flame className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="truncate font-medium text-slate-200">{incident.nearest_infrastructure.fire_station.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold px-1.5 py-0.2 rounded bg-emerald-950/40 border border-emerald-500/30 flex-shrink-0">
                        {incident.nearest_infrastructure.fire_station.distance_km} km
                      </span>
                    </div>
                  )}

                  {incident.nearest_infrastructure.station && (
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/5 border border-white/5 text-[11px]">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Train className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                        <span className="truncate font-medium text-slate-200">{incident.nearest_infrastructure.station.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold px-1.5 py-0.2 rounded bg-emerald-950/40 border border-emerald-500/30 flex-shrink-0">
                        {incident.nearest_infrastructure.station.distance_km} km
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Replay button */}
            {onOpenReplay && (
              <button
                onClick={onOpenReplay}
                className="w-full py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-semibold text-xs hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Replay Evolution</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* TAB 2: CAUSE */}
        {activeTab === 'cause' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1 p-0.5 bg-white/5 rounded-xl text-[10px]">
              {(['combined', 'rules', 'ml'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setCauseMode(m)}
                  className={`flex-1 py-1 rounded-lg capitalize transition-colors font-medium ${
                    causeMode === m
                      ? 'bg-cyan-500/30 text-cyan-300 font-bold border border-cyan-400/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="h-44 w-full bg-slate-900/60 border border-white/5 rounded-xl p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRanking} layout="vertical" margin={{ top: 5, right: 25, left: 10, bottom: 5 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={10}
                    width={90}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-slate-950 border border-white/20 p-2 rounded-lg text-[10px] shadow-xl">
                            <div className="font-bold text-white">{data.fullLabel}</div>
                            <div className="text-cyan-300 font-mono">{data.probability}% probability</div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="probability" radius={[0, 4, 4, 0]}>
                    {chartRanking.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#06b6d4' : '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="text-[10px] text-slate-400 text-center font-mono">
              Top inference: <strong className="text-cyan-300">{formatCause(incident.primary_cause)}</strong> ({confPercent}%)
            </div>
          </div>
        )}

        {/* TAB 3: TREND */}
        {activeTab === 'trend' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                <span>Confidence Evolution</span>
                <span className="font-mono text-emerald-400">{confPercent}%</span>
              </div>
              <div className="h-28 w-full bg-slate-900/60 border border-white/5 rounded-xl p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="#64748b" fontSize={9} tickLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-950 border border-white/20 px-2 py-1 rounded text-[10px]">
                              <span className="text-cyan-300 font-mono font-bold">{payload[0].value}% confidence</span>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Line type="monotone" dataKey="confidence" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: '#0284c7' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center justify-between">
                <span>Rainfall Intensity (mm/h)</span>
                <span className="font-mono text-sky-300">{incident.city}</span>
              </div>
              <div className="h-24 w-full bg-slate-900/60 border border-white/5 rounded-xl p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rainData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" stroke="#64748b" fontSize={9} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-950 border border-white/20 px-2 py-1 rounded text-[10px]">
                              <span className="text-sky-300 font-mono font-bold">{payload[0].value} mm/h</span>
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Area type="monotone" dataKey="rain" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#rainGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EVIDENCE */}
        {activeTab === 'evidence' && (
          <div className="space-y-3" ref={eventListRef}>
            {/* Header shows the real event count */}
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Telemetry Evidence</span>
              <span className="font-mono text-cyan-400 font-bold px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-400/40">
                {eventCount} {eventCount === 1 ? 'event' : 'events'}
              </span>
            </div>

            {/* 2. Above the timeline: Small SVG node graph */}
            {eventCount > 0 && (
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-2.5">
                <div className="text-[9px] text-slate-400 uppercase font-mono tracking-wider flex items-center justify-between mb-1">
                  <span>Causal Sensor Graph</span>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-[2px] bg-emerald-400 inline-block" /> supports
                    </span>
                    <span className="text-rose-400 flex items-center gap-1">
                      <span className="w-2 h-[2px] border-b border-rose-400 border-dashed inline-block" /> conflict
                    </span>
                  </div>
                </div>

                <svg viewBox="0 0 300 130" className="w-full h-28">
                  {/* Lines and Nodes */}
                  {events.map((evt: any, i: number) => {
                    const eid = String(evt.id || evt.event_id || `E${i}`)
                    const isSelected = highlightedEventId === eid
                    const n = events.length
                    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
                    const dist = 48
                    const ex = 150 + dist * Math.cos(angle)
                    const ey = 65 + dist * Math.sin(angle)

                    // Trust size
                    const er = Math.max(6, Math.min(13, Math.round((evt.trust || 0.8) * 12)))

                    // Conflicting test
                    const isConflicting =
                      evt.is_contradicting ||
                      (evt.description && evt.description.toLowerCase().includes('no flood')) ||
                      incident.relationships?.some(
                        (r: any) =>
                          (r.source_id === eid) &&
                          (r.relationship_type === 'contradicts' || r.relationship_type === 'conflicting')
                      )

                    const { hex } = getEventIconAndColor(evt.type || evt.source_type)

                    return (
                      <g key={`svg-node-${eid}`} className="cursor-pointer" onClick={() => onSelectEvent?.(eid)}>
                        {/* Connecting Line */}
                        <line
                          x1="150"
                          y1="65"
                          x2={ex}
                          y2={ey}
                          stroke={isConflicting ? '#ef4444' : '#10b981'}
                          strokeWidth={isSelected ? '2.5' : '1.5'}
                          strokeDasharray={isConflicting ? '3 3' : 'none'}
                          strokeOpacity={isSelected ? 1 : 0.75}
                        />

                        {/* Outer Glow on Highlight */}
                        {isSelected && (
                          <circle cx={ex} cy={ey} r={er + 4} fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.8" />
                        )}

                        {/* Event Node circle */}
                        <circle
                          cx={ex}
                          cy={ey}
                          r={er}
                          fill={hex}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          className="transition-transform hover:scale-125"
                        />
                      </g>
                    )
                  })}

                  {/* Central Incident Node */}
                  <circle cx="150" cy="65" r="15" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.5" />
                  <text x="150" y="68" fill="#38bdf8" fontSize="8" fontWeight="bold" textAnchor="middle" pointerEvents="none">
                    INC
                  </text>
                </svg>
              </div>
            )}

            {/* 1. Evidence tab: vertical timeline of nodes */}
            {eventCount === 0 ? (
              <div className="text-center py-6 text-slate-500">No events attached to incident</div>
            ) : (
              <div className="relative pl-6 space-y-3 border-l-2 border-white/10 ml-3">
                {events.map((evt: any, i: number) => {
                  const eid = String(evt.id || evt.event_id || `EVT-${i + 1}`)
                  const isSelected = highlightedEventId === eid
                  const desc = evt.description || evt.payload?.description || evt.payload?.text || 'Telemetry signal received'
                  const isAnomaly = evt.is_anomaly
                  const isDuplicate = evt.is_duplicate
                  const isLate = checkIsLate(evt.event_time, evt.received_time)
                  const isUnverified = evt.signature_verified === false || (evt.trust !== undefined && evt.trust < 0.5)

                  const { icon, bg, border, text } = getEventIconAndColor(evt.type || evt.source_type)
                  const timeFormatted = evt.event_time
                    ? new Date(evt.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : `T-${(i + 1) * 8}m`

                  return (
                    <div
                      key={eid}
                      id={`event-item-${eid}`}
                      onClick={() => onSelectEvent?.(eid)}
                      className={`relative group cursor-pointer transition-all duration-150 ${
                        isSelected ? 'scale-[1.02]' : ''
                      }`}
                    >
                      {/* Timeline colored circle with type icon */}
                      <span
                        className={`absolute -left-[35px] top-1 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shadow-md transition-transform group-hover:scale-110 ${border} ${bg} ${
                          isSelected ? 'ring-2 ring-cyan-400 scale-110' : ''
                        }`}
                      >
                        {icon}
                      </span>

                      {/* Event Row Node */}
                      <div
                        className={`p-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 shadow-lg shadow-cyan-950/50'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-cyan-300 font-bold">{eid}</span>
                            <span className="text-slate-400">•</span>
                            <span className="font-mono text-slate-300">{timeFormatted}</span>
                          </div>

                          {/* Badges: ANOMALY / DUPLICATE / LATE / UNVERIFIED + ↗ link */}
                          <div className="flex items-center gap-1">
                            {isAnomaly && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-bold">
                                ANOMALY
                              </span>
                            )}
                            {isDuplicate && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-300 border border-slate-500/40 text-[9px]">
                                DUPLICATE
                              </span>
                            )}
                            {isLate && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">
                                LATE
                              </span>
                            )}
                            {isUnverified && (
                              <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[9px]">
                                UNVERIFIED
                              </span>
                            )}
                            {evt.source_url && (
                              <a
                                href={evt.source_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                title={`Source: ${evt.source_name || 'Portal'}`}
                                className="p-0.5 rounded text-cyan-400 hover:text-cyan-200 hover:bg-white/10 flex items-center"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* 1-Line Description */}
                        <div className="text-[11px] text-slate-200 truncate leading-snug">
                          {desc}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: BRIEFING */}
        {activeTab === 'briefing' && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              Diagnostic Synthesis
            </div>
            <div className="text-[11px] text-slate-300 line-clamp-4 leading-relaxed">
              {incident.explanation || 'Synthesized across multimodal sensor telemetry and causal inference models.'}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
