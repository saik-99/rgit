import React, { useState, useEffect } from 'react'
import { Radio } from 'lucide-react'
import { formatSourceType, formatCause } from '../../utils/formatters'
import { Label } from '../../ui/primitives'
import { getWsUrl } from '../../api'

interface TickerItem {
  id: string
  text: string
  time: string
  type: string
  city: string
  count: number
}

interface LiveTickerProps {
  activeCity: string
  incidents?: any[]
}

const INDIAN_CITIES = ['mumbai', 'pune', 'nagpur', 'delhi', 'bengaluru', 'hyderabad', 'guwahati']

const SAMPLE_FEEDS_BY_CITY: Record<string, string[]> = {
  mumbai: [
    'Water level gauge updated: Hindmata culvert saturation ping recorded',
    'Transit telemetry: BEST bus diversion active on arterial route 104',
    'Drainage failure probability calibrated to 88%',
    'Weather radar: Precipitation recorded at 14 mm/h Dadar station',
  ],
  pune: [
    'Road sensor: Shivajinagar underpass optical detector alert',
    'Citizen report: Mutha riverbank drainage backflow noted',
    'Transit signal: Pune Mahanagar Parivahan bus delay advisory',
  ],
  nagpur: [
    'Drainage monitor: Sitabuldi storm drain level warning',
    'Traffic telemetry: Wardha Road intersection congestion peak',
    'Weather telemetry: Thunderstorm squall line approaching',
  ],
  delhi: [
    'Road sensor: Minto Bridge underpass water depth sensor active',
    'Weather warning: Severe cloudburst band over Yamuna basin',
    'Transit dispatch: Ring Road DTDC bus diversion',
  ],
  bengaluru: [
    'Lake overflow telemetry: Bellandur culvert surge warning',
    'Road telemetry: Outer Ring Road slow transit speeds detected',
    'Power advisory: Substation breaker trip in Koramangala',
  ],
  hyderabad: [
    'Flood gauge: Hussain Sagar excess outflow valve alert',
    'Road sensor: Begumpet flyover lane restriction',
    'Transit telemetry: TSRTC route 10 fleet rerouted',
  ],
  guwahati: [
    'River gauge: Brahmaputra embankment water level rising',
    'Drainage report: G.S. Road waterlogging depth sensor trigger',
    'Emergency feed: SDRF standby advisory at Bharalu basin',
  ],
}

export const LiveTicker: React.FC<LiveTickerProps> = ({ activeCity, incidents }) => {
  const [messages, setMessages] = useState<TickerItem[]>([])

  useEffect(() => {
    if (incidents && incidents.length > 0) {
      const topItems: TickerItem[] = incidents.slice(0, 3).map((inc, idx) => {
        const cause = formatCause(inc.primary_cause || inc.cause)
        const title =
          inc.title && !inc.title.startsWith('SYN-') && !inc.title.startsWith('REAL-EV-')
            ? inc.title
            : `${cause} advisory`
        return {
          id: `inc-${inc.incident_id || idx}`,
          text: `${cause}: ${title}`,
          time: idx === 0 ? 'Just now' : `${idx}m ago`,
          type: 'incident',
          city: inc.city || (activeCity === 'all' ? 'All India' : activeCity),
          count: 1,
        }
      })
      setMessages(topItems)
      return
    }

    const isAll = activeCity.toLowerCase() === 'all'
    const targetCity = isAll ? 'mumbai' : activeCity.toLowerCase()
    const feeds = SAMPLE_FEEDS_BY_CITY[targetCity] || SAMPLE_FEEDS_BY_CITY.mumbai

    const initial: TickerItem[] = feeds.slice(0, 3).map((text, idx) => ({
      id: `init-${idx}`,
      text,
      time: idx === 0 ? 'Just now' : `${idx}m ago`,
      type: 'telemetry',
      city: isAll ? 'All India' : activeCity,
      count: 1,
    }))

    setMessages(initial)
  }, [activeCity, incidents])

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: any = null

    function addOrMergeMessage(text: string, type: string, city: string) {
      setMessages(prev => {
        if (prev.length > 0 && prev[0].text === text) {
          const updated = [...prev]
          updated[0] = { ...updated[0], count: updated[0].count + 1, time: 'Just now' }
          return updated
        }
        const newItem: TickerItem = {
          id: String(Date.now()),
          text,
          time: 'Just now',
          type,
          city,
          count: 1,
        }
        return [newItem, ...prev.slice(0, 2)]
      })
    }

    function connect() {
      if ((import.meta as any).env?.VITE_OFFLINE === 'true') return
      try {
        const wsUrl = getWsUrl('/stream')
        ws = new WebSocket(wsUrl)

        ws.onmessage = event => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'event_ingested' && data.event) {
              const evt = data.event
              const evtCity = (evt.city || 'mumbai').toLowerCase()

              if (activeCity.toLowerCase() !== 'all') {
                if (evtCity !== activeCity.toLowerCase()) return
              } else {
                if (!INDIAN_CITIES.includes(evtCity)) return
              }

              const friendlyType = formatSourceType(evt.source_type)
              let rawDesc = evt.payload?.text || evt.payload?.description || `Sensor signal ${evt.event_id || ''}`
              if (rawDesc.startsWith('SYN-') || rawDesc.startsWith('REAL-EV-')) {
                rawDesc = 'Telemetry sensor signal'
              }
              const msgText = `${friendlyType}: ${rawDesc}`

              addOrMergeMessage(msgText, 'event', evtCity)
            } else if (data.type === 'incident_updated' && data.incident) {
              const inc = data.incident
              const incCity = (inc.city || 'mumbai').toLowerCase()

              if (activeCity.toLowerCase() !== 'all') {
                if (incCity !== activeCity.toLowerCase()) return
              } else {
                if (!INDIAN_CITIES.includes(incCity)) return
              }

              const causeFriendly = formatCause(inc.cause || inc.primary_cause)
              const title =
                inc.title && !inc.title.startsWith('SYN-') && !inc.title.startsWith('REAL-EV-')
                  ? inc.title
                  : `${causeFriendly} advisory`
              addOrMergeMessage(`${causeFriendly}: ${title}`, 'incident', incCity)
            }
          } catch {
            // Ignore
          }
        }

        ws.onerror = () => {
          ws?.close()
        }

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connect, 6000)
        }
      } catch {
        // Fallback
      }
    }

    connect()

    const simInterval = setInterval(() => {
      const isAll = activeCity.toLowerCase() === 'all'
      const cityKey = isAll
        ? INDIAN_CITIES[Math.floor(Math.random() * INDIAN_CITIES.length)]
        : activeCity.toLowerCase()
      const pool = SAMPLE_FEEDS_BY_CITY[cityKey] || SAMPLE_FEEDS_BY_CITY.mumbai
      const pick = pool[Math.floor(Math.random() * pool.length)]
      addOrMergeMessage(pick, 'telemetry', cityKey)
    }, 12000)

    return () => {
      if (ws) ws.close()
      clearTimeout(reconnectTimeout)
      clearInterval(simInterval)
    }
  }, [activeCity])

  const opacities = ['opacity-100', 'opacity-60', 'opacity-[0.35]']

  return (
    <div className="absolute bottom-6 left-4 z-20 w-84 sm:w-96 bg-[var(--bg-panel)] backdrop-blur-xl border border-[var(--border)] rounded-2xl shadow-2xl p-3 text-[var(--text)] pointer-events-auto">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--ok)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--ok)]" />
          </span>
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-[var(--ok)] stroke-[1.5]" />
            <Label>{`Live ticker · ${activeCity === 'all' ? 'All India' : activeCity}`}</Label>
          </div>
        </div>
        <Label>
          {activeCity === 'all' ? '7 cities' : activeCity}
        </Label>
      </div>

      <div className="space-y-1.5">
        {messages.slice(0, 3).map((msg, index) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2 text-[12px] leading-snug transition-opacity duration-300 ${opacities[index] || 'opacity-35'}`}
          >
            <span className="text-[var(--text-muted)] mt-0.5">·</span>
            <div className="flex-1 text-[var(--text)] truncate">
              {msg.text}
              {msg.count > 1 && (
                <span className="text-[var(--text-muted)] text-[10px] ml-1">×{msg.count}</span>
              )}
            </div>
            <span className="text-[var(--text-muted)] text-[10px] shrink-0">{msg.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
