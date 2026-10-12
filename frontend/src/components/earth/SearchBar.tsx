import React, { useState, useRef, useEffect } from 'react'
import { Search, X, MapPin } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { V1Incident } from '../../api'
import { formatCause } from '../../utils/formatters'

interface SearchBarProps {
  incidents: V1Incident[]
  onSelectIncident: (inc: V1Incident) => void
}

export const SearchBar: React.FC<SearchBarProps> = ({ incidents, onSelectIncident }) => {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Metrics for top-left stats row
  const activeCount = incidents.length
  const avgConfidence = Math.round(
    (incidents.reduce((acc, i) => acc + (i.cause_confidence || 0), 0) / (incidents.length || 1)) * 100
  )
  const eventsPerMin = 14
  const quarantinedCount = 1

  const matches = query.trim()
    ? incidents.filter(
        inc =>
          inc.title.toLowerCase().includes(query.toLowerCase()) ||
          inc.incident_id.toLowerCase().includes(query.toLowerCase()) ||
          (inc.neighborhood && inc.neighborhood.toLowerCase().includes(query.toLowerCase())) ||
          (inc.primary_cause && inc.primary_cause.toLowerCase().includes(query.toLowerCase())) ||
          formatCause(inc.primary_cause).toLowerCase().includes(query.toLowerCase())
      )
    : []

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="absolute top-4 left-4 z-30 w-80 pointer-events-auto">
      {/* Search Input Bar */}
      <div className="relative flex items-center bg-slate-950/85 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-1.5 focus-within:border-cyan-400/50 transition-colors">
        <Search className="w-4 h-4 text-slate-400 ml-2 mr-2 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search incidents, sectors, or devices..."
          className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none pr-7"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setIsOpen(false)
            }}
            className="absolute right-2.5 p-0.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* TOP-LEFT STATS ROW: Small glass chips under the search bar (Number + icon only) */}
      <div className="flex items-center gap-1.5 mt-2">
        <div
          title={`Active Incidents: ${activeCount}`}
          className="px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-xl border border-white/10 text-white text-[11px] font-mono font-bold flex items-center gap-1 shadow-lg hover:border-rose-400/50 transition-colors cursor-default"
        >
          <span>🚨</span>
          <span className="text-rose-300">{activeCount}</span>
        </div>

        <div
          title={`Streaming Telemetry: ${eventsPerMin} events/min`}
          className="px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-xl border border-white/10 text-white text-[11px] font-mono font-bold flex items-center gap-1 shadow-lg hover:border-amber-400/50 transition-colors cursor-default"
        >
          <span>⚡</span>
          <span className="text-amber-300">{eventsPerMin}/m</span>
        </div>

        <div
          title={`Average Confidence: ${avgConfidence}%`}
          className="px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-xl border border-white/10 text-white text-[11px] font-mono font-bold flex items-center gap-1 shadow-lg hover:border-emerald-400/50 transition-colors cursor-default"
        >
          <span>🎯</span>
          <span className="text-emerald-300">{avgConfidence}%</span>
        </div>

        <div
          title={`Quarantined / Flagged Sensors: ${quarantinedCount}`}
          className="px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-xl border border-white/10 text-white text-[11px] font-mono font-bold flex items-center gap-1 shadow-lg hover:border-purple-400/50 transition-colors cursor-default"
        >
          <span>🛡️</span>
          <span className="text-purple-300">{quarantinedCount}</span>
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      <AnimatePresence>
        {isOpen && matches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="mt-2 bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto"
          >
            {matches.map(inc => (
              <div
                key={inc.incident_id}
                onClick={() => {
                  onSelectIncident(inc)
                  setIsOpen(false)
                  setQuery('')
                }}
                className="p-2.5 hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0 flex items-start gap-2.5 text-xs text-white transition-colors"
              >
                <MapPin className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-cyan-300 text-[10px]">{inc.incident_id}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {Math.round((inc.cause_confidence || 0) * 100)}%
                    </span>
                  </div>
                  <div className="font-semibold text-slate-100 line-clamp-1">{inc.title}</div>
                  <div className="text-[10px] text-cyan-300 font-medium">
                    {formatCause(inc.primary_cause)}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
