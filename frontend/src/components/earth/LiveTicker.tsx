import React, { useState, useEffect } from 'react'
import { Radio } from 'lucide-react'
import { formatSourceType, formatCause } from '../../utils/formatters'

interface TickerItem {
  id: string
  text: string
  time: string
  type: string
  city: string
}

interface LiveTickerProps {
  activeCity: string
}

export const LiveTicker: React.FC<LiveTickerProps> = ({ activeCity }) => {
  const [messages, setMessages] = useState<TickerItem[]>([])

  // Seed initial messages when activeCity changes
  useEffect(() => {
    const isMumbai = activeCity.toLowerCase() === 'mumbai'
    const initial: TickerItem[] = isMumbai
      ? [
          {
            id: 'm1',
            text: '💧 Water level gauge updated (92.5 cm at Hindmata flyover)',
            time: 'Just now',
            type: 'sensor',
            city: 'Mumbai',
          },
          {
            id: 'm2',
            text: '🚌 Transit telemetry: BEST bus diversion active on arterial route 104',
            time: '1m ago',
            type: 'transit',
            city: 'Mumbai',
          },
          {
            id: 'm3',
            text: '🌊 Drainage / Flooding confidence calibrated to 88%',
            time: '2m ago',
            type: 'engine',
            city: 'Mumbai',
          },
        ]
      : [
          {
            id: 'ny1',
            text: '🚦 Road sensor: Traffic speed plunges on Manhattan Avenue',
            time: 'Just now',
            type: 'sensor',
            city: 'New York',
          },
          {
            id: 'ny2',
            text: '📢 Citizen report: NYC 311 defect confirmed by traffic telemetry',
            time: '1m ago',
            type: 'citizen',
            city: 'New York',
          },
          {
            id: 'ny3',
            text: '🚧 Road Blockage confidence calibrated to 72%',
            time: '3m ago',
            type: 'engine',
            city: 'New York',
          },
        ]

    setMessages(initial)
  }, [activeCity])

  // WebSocket listener filtering strictly by activeCity
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: any = null

    function connect() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const host = window.location.host
        const wsUrl = `${protocol}//${host}/api/stream`

        ws = new WebSocket(wsUrl)

        ws.onmessage = event => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'event_ingested' && data.event) {
              const evt = data.event
              const evtCity = evt.city || (evt.lat && Number(evt.lat) > 35 ? 'New York' : 'Mumbai')

              // Only show events from the selected city
              if (evtCity.toLowerCase() !== activeCity.toLowerCase()) {
                return
              }

              const friendlyType = formatSourceType(evt.source_type)
              const rawDesc = evt.payload?.text || evt.payload?.description || `Sensor signal ${evt.event_id || ''}`
              const msgText = `${friendlyType}: ${rawDesc}`

              addMessage(msgText, 'event', evtCity)
            } else if (data.type === 'incident_updated' && data.incident) {
              const inc = data.incident
              const incCity = inc.city || 'Mumbai'

              if (incCity.toLowerCase() !== activeCity.toLowerCase()) {
                return
              }

              const causeFriendly = formatCause(inc.cause || inc.primary_cause)
              const title = inc.title || `${inc.incident_id} updated`
              addMessage(`${causeFriendly} (${inc.incident_id || inc.id}): ${title}`, 'incident', incCity)
            }
          } catch {
            // Ignore non-json
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

    // Periodic simulation fallback filtered strictly by activeCity
    const simInterval = setInterval(() => {
      const isMumbai = activeCity.toLowerCase() === 'mumbai'
      const mumbaiFeeds = [
        '💧 Water level: Hindmata culvert telemetry ping received (normal flow rate)',
        '🌧️ Weather radar: Precipitation recorded at 14 mm/h Dadar station',
        '🚌 Transit telemetry: Central Railway Matunga track gauge telemetry active',
        '📞 Emergency calls: BMC disaster management desk ping verified',
      ]
      const nyFeeds = [
        '🚦 Road sensor: Brooklyn Manhattan Ave induction loop telemetry active',
        '🌧️ Weather radar: Central Park station precipitation nominal (2 mm/h)',
        '📢 Citizen report: 311 municipal road inspection scheduled',
        '🚉 Railway Station: Bedford Avenue MTA track telemetry active',
      ]

      const pickList = isMumbai ? mumbaiFeeds : nyFeeds
      const pick = pickList[Math.floor(Math.random() * pickList.length)]
      addMessage(pick, 'telemetry', activeCity)
    }, 14000)

    function addMessage(text: string, type: string, city: string) {
      setMessages(prev => {
        const newItem: TickerItem = {
          id: String(Date.now()),
          text,
          time: 'Just now',
          type,
          city,
        }
        return [newItem, ...prev.slice(0, 2)]
      })
    }

    return () => {
      if (ws) ws.close()
      clearTimeout(reconnectTimeout)
      clearInterval(simInterval)
    }
  }, [activeCity])

  return (
    <div className="absolute bottom-6 left-4 z-20 w-84 sm:w-96 bg-slate-950/85 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-3 text-white pointer-events-auto">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-emerald-400" />
            Live Ticker — {activeCity}
          </span>
        </div>
        <span className="text-[9px] font-mono text-cyan-400 font-semibold px-1.5 py-0.5 rounded bg-white/5 border border-white/5">
          {activeCity} ONLY
        </span>
      </div>

      <div className="space-y-1.5">
        {messages.slice(0, 3).map(msg => (
          <div key={msg.id} className="flex items-start gap-2 text-[10px]">
            <span className="text-cyan-400 mt-0.5">•</span>
            <div className="flex-1 text-slate-300 line-clamp-1 leading-tight">
              {msg.text}
            </div>
            <span className="text-slate-500 font-mono flex-shrink-0 text-[9px]">{msg.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
