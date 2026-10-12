import React, { useState, useRef, useEffect } from 'react'
import { Search, X, MapPin, Play, Square, Volume2, VolumeX } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { V1Incident } from '../../api'
import { formatCause } from '../../utils/formatters'
import { Stat, IconButton, Label } from '../../ui/primitives'

interface SearchBarProps {
  incidents: V1Incident[]
  onSelectIncident: (inc: V1Incident) => void
  onStartTour?: () => void
  isTouring?: boolean
  isMuted?: boolean
  onToggleMute?: () => void
  activeIncidentsCount: number
}

export const SearchBar: React.FC<SearchBarProps> = ({
  incidents,
  onSelectIncident,
  onStartTour,
  isTouring = false,
  isMuted = false,
  onToggleMute,
  activeIncidentsCount,
}) => {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
    <div ref={containerRef} className="absolute top-4 left-4 z-30 w-84 pointer-events-auto">
      {/* Top Search Controls Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative flex items-center bg-[var(--bg-panel)] backdrop-blur-xl border border-[var(--border)] rounded-xl shadow-2xl p-1.5 focus-within:border-[var(--accent)] transition-colors">
          <Search className="w-4 h-4 text-[var(--text-muted)] ml-1.5 mr-2 flex-shrink-0 stroke-[1.5]" />
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search incidents or sectors..."
            className="w-full bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none pr-6"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setIsOpen(false)
              }}
              className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X className="w-3.5 h-3.5 stroke-[1.5]" />
            </button>
          )}
        </div>

        {/* Play Tour IconButton */}
        {onStartTour && (
          <IconButton
            onClick={onStartTour}
            title={isTouring ? 'Stop tour' : 'Play incident tour'}
            active={isTouring}
          >
            {isTouring ? <Square className="w-4 h-4 stroke-[1.5]" /> : <Play className="w-4 h-4 stroke-[1.5]" />}
          </IconButton>
        )}

        {/* Speaker Mute IconButton */}
        {onToggleMute && (
          <IconButton
            onClick={onToggleMute}
            title={isMuted ? 'Unmute alerts' : 'Mute alerts'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 stroke-[1.5]" /> : <Volume2 className="w-4 h-4 stroke-[1.5]" />}
          </IconButton>
        )}
      </div>

      {/* ONE Glass Container with 4 Stats: Incidents, Events/min, Avg confidence, Quarantined */}
      <div className="mt-2.5 p-3 rounded-2xl bg-[var(--bg-panel)] backdrop-blur-xl border border-[var(--border)] shadow-2xl flex items-center justify-between">
        <Stat value={activeIncidentsCount} label="Incidents" />
        <div className="w-[1px] h-7 bg-white/10" />
        <Stat value={eventsPerMin} label="Events/min" />
        <div className="w-[1px] h-7 bg-white/10" />
        <Stat value={`${avgConfidence}%`} label="Avg confidence" />
        <div className="w-[1px] h-7 bg-white/10" />
        <Stat value={quarantinedCount} label="Quarantined" />
      </div>

      {/* Autocomplete Dropdown */}
      <AnimatePresence>
        {isOpen && matches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="mt-2 bg-[var(--bg-panel)] backdrop-blur-2xl border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto"
          >
            {matches.map(inc => (
              <div
                key={inc.incident_id}
                onClick={() => {
                  onSelectIncident(inc)
                  setIsOpen(false)
                  setQuery('')
                }}
                className="p-2.5 hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0 flex items-start gap-2.5 text-xs text-[var(--text)] transition-colors"
              >
                <MapPin className="w-4 h-4 text-[var(--accent)] mt-0.5 flex-shrink-0 stroke-[1.5]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <Label>{inc.incident_id}</Label>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {Math.round((inc.cause_confidence || 0) * 100)}%
                    </span>
                  </div>
                  <div className="font-medium text-[var(--text)] truncate">{inc.title}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
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
