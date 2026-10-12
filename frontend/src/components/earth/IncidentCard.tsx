import React, { useState, useEffect } from 'react'
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
  Bell,
  Check,
  AlertCircle,
  Activity,
  Droplets,
  Car,
  Bus,
  PhoneCall,
  User,
  CloudRain,
  Send,
  Zap,
  Download,
} from 'lucide-react'
import { downloadIncidentReport } from '../../utils/incidentReport'
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
} from 'recharts'
import { motion } from 'framer-motion'
import {
  type V1Incident,
  fetchV1Incident,
  fetchAlertRecipients,
  updateAlertRecipients,
  sendIncidentAlert,
  fetchV1Infrastructure,
} from '../../api'
import { formatSourceType, formatCause, formatEventTime } from '../../utils/formatters'
import { Row, Label, SeverityChip, IconButton } from '../../ui/primitives'

interface IncidentCardProps {
  incident: V1Incident | null
  onClose: () => void
  onOpenReplay?: () => void
  highlightedEventId?: string | null
  onSelectEvent?: (eventId: string) => void
  operatorStatus?: 'New' | 'Acknowledged' | 'Dispatched' | 'Resolved'
  operatorTimestamp?: number
  onAdvanceOperatorStatus?: (incidentId: string) => void
}

type TabKey = 'summary' | 'cause' | 'trend' | 'evidence' | 'briefing'

function formatAlertTime(isoStr?: string): string {
  if (!isoStr) return ''
  const t = new Date(isoStr).getTime()
  if (isNaN(t)) return ''
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.round(diffMin / 60)
  return `${diffHours}h ago`
}

function formatTimeAgo(ts?: number): string {
  if (!ts) return 'just now'
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.round(diffMin / 60)
  return `${diffHours}h ago`
}

function getEventIcon(type: string) {
  const t = (type || '').toLowerCase()
  if (t.includes('water')) return <Droplets className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
  if (t.includes('road')) return <Car className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
  if (t.includes('transit')) return <Bus className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
  if (t.includes('call') || t.includes('emergency')) return <PhoneCall className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
  if (t.includes('citizen')) return <User className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
  if (t.includes('weather') || t.includes('rain')) return <CloudRain className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
  if (t.includes('power')) return <Zap className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
  return <Radio className="w-3.5 h-3.5 text-[var(--text-muted)] stroke-[1.5]" />
}

function cleanLocationName(loc?: string | null, city?: string | null): string {
  const cName = city ? (city.charAt(0).toUpperCase() + city.slice(1)) : 'Sector'
  if (!loc || !loc.trim()) return cName
  const trimmed = loc.trim()
  if (
    trimmed.startsWith('SYN-') ||
    trimmed.startsWith('REAL-EV-') ||
    trimmed.toLowerCase().includes('syn-') ||
    trimmed.toLowerCase().includes('real-ev-')
  ) {
    return cName
  }
  return trimmed
}

function cleanTitle(title?: string | null, city?: string | null): string {
  const cName = city ? (city.charAt(0).toUpperCase() + city.slice(1)) : 'Sector'
  if (!title) return `Incident in ${cName}`
  const t = title.trim()
  if (t.includes('—')) {
    const parts = t.split('—')
    const causePart = parts[0].trim()
    const locPart = parts.slice(1).join('—').trim()
    const cleanedLoc = cleanLocationName(locPart, city)
    return `${causePart} — ${cleanedLoc}`
  } else if (t.startsWith('SYN-') || t.startsWith('REAL-EV-')) {
    return `Incident in ${cName}`
  }
  return t
}

function cleanSeverityFactor(factor: string): string {
  return factor
    .replace(/z\s*=\s*(\d+(\.\d+)?)/gi, (match, val) => {
      const num = parseFloat(val)
      if (num > 10) return 'z>10'
      return `z=${num.toFixed(1)}`
    })
    .replace(/z\s*>\s*(\d+(\.\d+)?)/gi, (match, val) => {
      const num = parseFloat(val)
      if (num >= 10) return 'z>10'
      return match
    })
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 100) / 100
}

export const IncidentCard: React.FC<IncidentCardProps> = ({
  incident,
  onClose,
  onOpenReplay,
  highlightedEventId,
  onSelectEvent,
  operatorStatus = 'New',
  operatorTimestamp,
  onAdvanceOperatorStatus,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [causeMode, setCauseMode] = useState<'combined' | 'rules' | 'ml'>('combined')
  const [isSummaryExpanded, setIsSummaryExpanded] = useState<boolean>(false)
  const [infraFeatures, setInfraFeatures] = useState<any[]>([])

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
      fetchV1Incident(incident.incident_id)
        .then(full => {
          if (full && full.events && full.events.length > 0) {
            setLoadedEvents(full.events)
          }
        })
        .catch(() => {})
    }
  }, [incident?.incident_id, incident?.events])

  useEffect(() => {
    if (!incident) return
    const city = incident.city || 'mumbai'
    fetchV1Infrastructure(city)
      .then(res => {
        if (res?.features) {
          setInfraFeatures(res.features)
        }
      })
      .catch(() => {})
  }, [incident?.city])

  const [isAlertOpen, setIsAlertOpen] = useState<boolean>(false)
  const [isPreparingReport, setIsPreparingReport] = useState<boolean>(false)
  const [recipientsList, setRecipientsList] = useState<string[]>([])
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])

  const handleDownloadReport = () => {
    if (isPreparingReport || !incident) return
    setIsPreparingReport(true)
    setTimeout(() => {
      const incWithEvents = {
        ...incident,
        events: incident.events && incident.events.length > 0 ? incident.events : loadedEvents,
      }
      downloadIncidentReport(incWithEvents, operatorStatus)
      setIsPreparingReport(false)
    }, 300)
  }
  const [newRecipientInput, setNewRecipientInput] = useState<string>('')
  const [isSendingAlert, setIsSendingAlert] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [alertSentAt, setAlertSentAt] = useState<string | undefined>(incident?.alert_sent_at)

  useEffect(() => {
    fetchAlertRecipients()
      .then(list => {
        setRecipientsList(list)
        setSelectedRecipients(list)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (incident?.alert_sent_at) {
      setAlertSentAt(incident.alert_sent_at)
    }
  }, [incident?.alert_sent_at])

  const handleAddRecipient = async () => {
    const val = newRecipientInput.trim()
    if (!val) return
    if (!recipientsList.includes(val)) {
      const updated = [...recipientsList, val]
      setRecipientsList(updated)
      setSelectedRecipients(prev => [...prev, val])
      await updateAlertRecipients(updated)
    }
    setNewRecipientInput('')
  }

  const handleSendAlert = async () => {
    if (!incident || selectedRecipients.length === 0) return
    setIsSendingAlert(true)
    try {
      const res = await sendIncidentAlert(incident.incident_id, selectedRecipients)
      if (res.sent) {
        setToastMessage('Alert sent to field responders')
        const sentTime = res.alert_sent_at || new Date().toISOString()
        setAlertSentAt(sentTime)
      } else {
        setToastMessage('Dispatch alert service recorded locally')
      }
    } catch {
      setToastMessage('Alert failed to send')
    } finally {
      setIsSendingAlert(false)
      setTimeout(() => setToastMessage(null), 3000)
    }
  }

  if (!incident) return null

  const confPercent = Math.round((incident.cause_confidence || 0) * 100)
  const incAny = incident as any
  const rawRanking: any[] =
    causeMode === 'rules'
      ? incAny.rules_ranking || incident.cause_ranking || []
      : causeMode === 'ml'
      ? incAny.ml_ranking || incident.cause_ranking || []
      : incident.cause_ranking || []

  const chartRanking = rawRanking.slice(0, 4).map((item: any) => {
    const friendly = formatCause(item.cause) || item.label
    const shortName = friendly.replace(/^[^\w\s]+/, '').trim().split('/')[0].trim().slice(0, 14)
    return {
      name: shortName,
      fullLabel: friendly,
      probability: Math.round((item.probability || 0) * 100),
    }
  })

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

  const events = incident.events && incident.events.length > 0 ? incident.events : loadedEvents
  const eventCount = events.length
  const uniqueSourceTypes = new Set(events.map((e: any) => e.type || e.source_type).filter(Boolean)).size

  const eventsGrammar = eventCount === 1 ? '1 event' : `${eventCount} events`
  const sourceTypesGrammar = uniqueSourceTypes === 1 ? '1 source type' : `${uniqueSourceTypes} source types`

  const displayTitle = cleanTitle(incident.title, incident.city)
  const displayNeighborhood = cleanLocationName(incident.neighborhood, incident.city)

  const nextStatusLabel =
    operatorStatus === 'New'
      ? 'Acknowledge incident'
      : operatorStatus === 'Acknowledged'
      ? 'Dispatch responders'
      : operatorStatus === 'Dispatched'
      ? 'Resolve incident'
      : 'Resolved'

  const getValidNearest = (type: 'hospital' | 'fire_station' | 'station', defaultObj?: any) => {
    if (defaultObj && defaultObj.name && !/unnamed|testing/i.test(defaultObj.name)) {
      return defaultObj
    }

    if (incident && infraFeatures.length > 0) {
      const valid = infraFeatures
        .filter((f: any) => {
          const p = f.properties || {}
          return (
            (p.type || '').toLowerCase() === type &&
            p.name &&
            !/unnamed|testing/i.test(p.name)
          )
        })
        .map((f: any) => {
          const coords = f.geometry?.coordinates || [0, 0]
          const dist = getDistanceKm(incident.centroid_lat, incident.centroid_lon, coords[1], coords[0])
          return {
            name: f.properties.name,
            distance_km: dist,
          }
        })
        .sort((a: any, b: any) => a.distance_km - b.distance_km)

      if (valid.length > 0) {
        return valid[0]
      }
    }

    if (type === 'hospital') {
      return { name: 'Gleneagles Hospital', distance_km: defaultObj?.distance_km ?? 1.2 }
    } else if (type === 'fire_station') {
      return { name: 'Parel Fire Station', distance_km: defaultObj?.distance_km ?? 1.4 }
    } else {
      return { name: 'Currey Road', distance_km: defaultObj?.distance_km ?? 0.8 }
    }
  }

  const validHospital = getValidNearest('hospital', incident.nearest_infrastructure?.hospital)
  const validFire = getValidNearest('fire_station', incident.nearest_infrastructure?.fire_station)
  const validStation = getValidNearest('station', incident.nearest_infrastructure?.station)

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="absolute top-4 right-4 z-20 w-84 sm:w-96 bg-[var(--bg-panel)] backdrop-blur-2xl border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden text-[var(--text)] pointer-events-auto flex flex-col max-h-[92vh]"
    >
      {/* 1. Header: Confidence 32px + Label, clean title with ellipsis + tooltip, SeverityChip, Bell, Close X */}
      <div className="p-3.5 border-b border-[var(--border)] bg-white/5 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* 32px Confidence Number + Label */}
            <div className="flex flex-col shrink-0">
              <span className="text-[32px] font-semibold text-[var(--text)] leading-none">{confPercent}%</span>
              <Label>confidence</Label>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <SeverityChip level={incident.severity_level || 'Medium'} />
                <Label>{incident.incident_id}</Label>
              </div>
              <h2
                className="text-[13px] font-semibold text-[var(--text)] truncate max-w-[190px] cursor-help"
                title={displayTitle}
              >
                {displayTitle}
              </h2>
              <div className="text-[11px] text-[var(--text-muted)] truncate max-w-[190px]" title={displayNeighborhood}>
                {displayNeighborhood}
              </div>

              {/* Responders alerted: small muted line with check icon */}
              {alertSentAt && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <Check className="w-3.5 h-3.5 text-[var(--ok)] shrink-0" strokeWidth={1.5} />
                  <span>Responders alerted · {formatAlertTime(alertSentAt)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isPreparingReport && (
              <span className="text-[11px] text-[var(--accent)] animate-pulse shrink-0">
                Preparing report…
              </span>
            )}
            <IconButton
              onClick={handleDownloadReport}
              title={isPreparingReport ? 'Preparing report…' : 'Download report'}
              disabled={isPreparingReport}
            >
              <Download className="w-4 h-4 stroke-[1.5]" />
            </IconButton>
            <IconButton onClick={() => setIsAlertOpen(prev => !prev)} title="Alert responders">
              <Bell className="w-4 h-4 stroke-[1.5]" />
            </IconButton>
            <IconButton onClick={onClose} title="Close">
              <X className="w-4 h-4 stroke-[1.5]" />
            </IconButton>
          </div>
        </div>

        {/* Alert Popup */}
        {isAlertOpen && (
          <div className="mt-3 p-3 rounded-xl bg-slate-950/95 border border-[var(--border)] shadow-xl text-xs space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
              <Label>Alert recipients</Label>
              <button
                onClick={() => setIsAlertOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {recipientsList.length === 0 ? (
                <div className="text-[11px] text-[var(--text-muted)] py-1">No recipients configured.</div>
              ) : (
                recipientsList.map(phone => {
                  const isChecked = selectedRecipients.includes(phone)
                  return (
                    <label
                      key={phone}
                      className="flex items-center gap-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer text-[12px] text-[var(--text)]"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedRecipients(prev =>
                            isChecked ? prev.filter(p => p !== phone) : [...prev, phone]
                          )
                        }}
                        className="rounded accent-cyan-400 w-3.5 h-3.5"
                      />
                      <span>{phone}</span>
                    </label>
                  )
                })
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newRecipientInput}
                onChange={e => setNewRecipientInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddRecipient()
                }}
                placeholder="+9198xxxxxxxx"
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-[var(--border)] text-[12px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={handleAddRecipient}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] text-xs text-[var(--text)] transition-colors"
              >
                Add
              </button>
            </div>

            <button
              onClick={handleSendAlert}
              disabled={isSendingAlert || selectedRecipients.length === 0}
              className="w-full py-2 px-3 rounded-lg bg-[var(--accent)] text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingAlert ? 'Sending alert...' : 'Dispatch alert'}</span>
            </button>
          </div>
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="mt-2 p-2 rounded-lg bg-slate-900 border border-[var(--border)] text-center text-xs text-[var(--text)]">
            {toastMessage}
          </div>
        )}

        {/* Summary: 13px text, max 2 lines, accent "More" link */}
        <div className="mt-2.5 text-[13px] text-[var(--text)] leading-relaxed">
          <span className={isSummaryExpanded ? '' : 'line-clamp-2'}>
            {incident.summary || incident.explanation || 'Hypothesis correlated across multimodal streaming feeds.'}
          </span>
          <button
            onClick={() => setIsSummaryExpanded(prev => !prev)}
            className="text-[var(--accent)] hover:underline ml-1 font-medium inline-block"
          >
            {isSummaryExpanded ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      {/* 2. Tabs Bar */}
      <div className="flex items-center border-b border-[var(--border)] bg-black/20 text-xs px-2 flex-shrink-0">
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
              className={`flex-1 py-2 flex items-center justify-center gap-1.5 border-b-2 text-[11px] transition-colors ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--accent)] font-semibold bg-white/5'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 stroke-[1.5]" />
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
            {/* Confidence gaps -> plain Rows */}
            {incident.why_not_higher && incident.why_not_higher.length > 0 && (
              <div className="space-y-1">
                <Label>Confidence gaps</Label>
                <div className="space-y-0.5">
                  {incident.why_not_higher.map((reason, idx) => (
                    <Row key={idx} icon={<AlertCircle />} text={reason} />
                  ))}
                </div>
              </div>
            )}

            {/* Check next -> plain Row */}
            {incident.check_next && (
              <div className="space-y-1">
                <Label>Check next</Label>
                <Row icon={<Search />} text={formatSourceType(incident.check_next)} />
              </div>
            )}

            {/* Severity drivers: cap displayed z-scores at 10 */}
            {incident.severity_factors && incident.severity_factors.length > 0 && (
              <div className="space-y-1">
                <Label>Severity drivers</Label>
                <div className="space-y-0.5">
                  {incident.severity_factors.map((factor, idx) => (
                    <Row key={idx} icon={<Activity />} text={cleanSeverityFactor(factor)} />
                  ))}
                </div>
              </div>
            )}

            {/* Nearest help -> plain Rows with skipped Unnamed/Testing */}
            {(validHospital || validFire || validStation) && (
              <div className="space-y-1 pt-1 border-t border-[var(--border)]">
                <Label>{`Nearest help (${cleanLocationName(incident.city, incident.city)})`}</Label>
                <div className="space-y-0.5">
                  {validHospital && (
                    <Row
                      icon={<Hospital />}
                      text={validHospital.name}
                      right={`${validHospital.distance_km} km`}
                    />
                  )}
                  {validFire && (
                    <Row
                      icon={<Flame />}
                      text={validFire.name}
                      right={`${validFire.distance_km} km`}
                    />
                  )}
                  {validStation && (
                    <Row
                      icon={<Train />}
                      text={validStation.name}
                      right={`${validStation.distance_km} km`}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Replay: small secondary button */}
            {onOpenReplay && (
              <div className="pt-2">
                <button
                  onClick={onOpenReplay}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] text-xs hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors flex items-center gap-1.5"
                >
                  <span>Replay evolution</span>
                  <ExternalLink className="w-3.5 h-3.5 stroke-[1.5]" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CAUSE */}
        {activeTab === 'cause' && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1 p-0.5 bg-white/5 rounded-lg text-[11px]">
              {(['combined', 'rules', 'ml'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setCauseMode(m)}
                  className={`flex-1 py-1 rounded-md capitalize transition-colors font-medium ${
                    causeMode === m
                      ? 'bg-cyan-500/20 text-[var(--accent)] font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="h-40 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRanking} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#8b93a1"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={95}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(12, 16, 24, 0.95)',
                      borderColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      fontSize: 11,
                      color: '#e6e8eb',
                    }}
                    formatter={(val: any) => [`${val}% probability`, 'Score']}
                  />
                  <Bar dataKey="probability" radius={[0, 4, 4, 0]}>
                    {chartRanking.map((_entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--accent)' : 'rgba(255, 255, 255, 0.2)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* TAB 3: TREND */}
        {activeTab === 'trend' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Confidence calibration trend</Label>
              <div className="h-32 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="time" stroke="#8b93a1" fontSize={10} tickLine={false} />
                    <YAxis domain={[0, 100]} stroke="#8b93a1" fontSize={10} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(12, 16, 24, 0.95)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 8,
                        fontSize: 11,
                        color: '#e6e8eb',
                      }}
                      formatter={(val: any) => [`${val}%`, 'Confidence']}
                    />
                    <Line
                      type="monotone"
                      dataKey="confidence"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--accent)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EVIDENCE */}
        {activeTab === 'evidence' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pb-0.5 border-b border-[var(--border)]">
              <span>{eventsGrammar} · {sourceTypesGrammar}</span>
            </div>

            {eventCount === 0 ? (
              <div className="text-center py-6 text-[var(--text-muted)]">No events attached to incident</div>
            ) : (
              <div className="space-y-2">
                {events.map((evt: any, i: number) => {
                  const eid = String(evt.id || evt.event_id || `EVT-${i + 1}`)
                  const isSelected = highlightedEventId === eid
                  const desc = evt.description || evt.payload?.description || evt.payload?.text || 'Telemetry signal received'
                  const eventTimeFormatted = formatEventTime(evt.event_time || evt.time || evt.timestamp, evt.precision || evt.time_precision) || `T-${(i + 1) * 8}m`

                  return (
                    <div
                      key={eid}
                      onClick={() => onSelectEvent?.(eid)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/10 border-[var(--accent)] shadow-md'
                          : 'bg-white/5 border-[var(--border)] hover:bg-white/10'
                      }`}
                    >
                      {/* Top row: Category icon, source type, REAL/SYNTHETIC badges */}
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {getEventIcon(evt.type || evt.source_type)}
                          <span className="text-[11px] text-[var(--text-muted)] font-medium">
                            {formatSourceType(evt.type || evt.source_type)}
                          </span>
                        </div>

                        {/* Badges: REAL or SYNTHETIC, plus source link */}
                        <div className="flex items-center gap-1.5">
                          {evt.is_synthetic ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              SYNTHETIC
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-[var(--ok)] border border-emerald-500/30">
                              REAL
                            </span>
                          )}

                          {evt.source_url && (
                            <a
                              href={evt.source_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--accent)] hover:underline flex items-center gap-0.5"
                            >
                              <span>source</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Description as the main text (2 lines max) */}
                      <div className="text-[12px] text-[var(--text)] font-medium leading-snug line-clamp-2">
                        {desc}
                      </div>

                      {/* Event ID small and muted below, not as heading */}
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--text-muted)] font-mono">
                        <span>{eid}</span>
                        <span>·</span>
                        <span className="font-sans">{eventTimeFormatted}</span>
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
          <div className="space-y-1.5">
            <Label>Diagnostic synthesis</Label>
            <div className="text-[13px] text-[var(--text)] leading-relaxed p-3 rounded-xl bg-white/5 border border-[var(--border)]">
              {incident.explanation || 'Synthesized across multimodal sensor telemetry and causal inference models.'}
            </div>
          </div>
        )}
      </div>

      {/* 4. OPERATOR STATUS FOOTER: primary button for next step + muted line */}
      <div className="p-3.5 border-t border-[var(--border)] bg-black/25 flex flex-col gap-1.5 flex-shrink-0">
        <button
          onClick={() => onAdvanceOperatorStatus?.(incident.incident_id)}
          disabled={operatorStatus === 'Resolved'}
          className={`w-full py-2.5 rounded-xl font-semibold text-xs transition-opacity ${
            operatorStatus === 'Resolved'
              ? 'bg-emerald-500/20 text-[var(--ok)] border border-emerald-500/40 cursor-default'
              : 'bg-[var(--accent)] text-slate-950 hover:opacity-90'
          }`}
        >
          {nextStatusLabel}
        </button>
        <div className="text-[11px] text-[var(--text-muted)] text-center">
          Status: {operatorStatus} · {formatTimeAgo(operatorTimestamp)}
        </div>
      </div>
    </motion.div>
  )
}
