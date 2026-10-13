import React, { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  X,
  Send,
  Phone,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  MapPin,
  ShieldAlert,
  HelpCircle,
  PhoneCall,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { V1Incident } from '../../api'
import { sendCopilotMessage, type CopilotAction } from '../../api'

interface CopilotMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  source?: 'groq' | 'fallback'
  suggestions?: string[]
  action?: CopilotAction | null
  actionConfirmed?: boolean
  actionCancelled?: boolean
}

interface CopilotWidgetProps {
  activeCity: string
  selectedIncident: V1Incident | null
  incidents: V1Incident[]
  isIncidentOpen: boolean
  onSelectIncident: (inc: V1Incident) => void
  onUpdateOperatorStatus: (incidentId: string, status: 'New' | 'Acknowledged' | 'Dispatched' | 'Resolved') => void
  onUpdatePriority?: (incidentId: string, priority: string) => void
  hasNewHighIncident?: boolean
  onClearNewHighBadge?: () => void
}

const INDIAN_HELPLINES = [
  { name: 'National Emergency', number: '112', desc: 'All-in-one emergency response across India' },
  { name: 'Police Control', number: '100', desc: 'Immediate police response' },
  { name: 'Fire & Rescue', number: '101', desc: 'Fire department & rescue dispatch' },
  { name: 'Ambulance', number: '108', desc: 'Emergency medical transport' },
  { name: 'Disaster Authority', number: '1078', desc: 'NDRF / Disaster management' },
  { name: 'Women Helpline', number: '1091', desc: '24x7 women safety support' },
  { name: 'Child Protection', number: '1098', desc: 'Emergency child helpline' },
]

const FAQ_ITEMS = [
  {
    q: 'How is confidence calculated?',
    a: 'Confidence is inferred through Bayesian sensor consensus and physical law verification (e.g. rain depth vs drainage culvert capacity). Conflicting signals or unverified single-modality sensors reduce the calibration score.',
  },
  {
    q: 'What does severity mean?',
    a: 'Severity scores (0 to 100) and levels (Critical, High, Medium, Low) reflect immediate public hazard, roadway impassability, and proximity to critical infrastructure such as hospitals and transit stations.',
  },
  {
    q: 'What is a quarantined sensor?',
    a: 'Sensors whose anomaly z-score exceeds 3.0 or fail cryptographic payload authentication are automatically quarantined to prevent adversarial spoofing or faulty gauge corruption.',
  },
  {
    q: 'What does "Check next" mean?',
    a: 'The highest-yield field verification action computed by the causal intelligence engine to eliminate the largest hypothesis gap or confirm root causes.',
  },
  {
    q: 'Is the data real or synthetic?',
    a: 'Real streaming telemetry from municipal open data portals and USGS/Open-Meteo feeds is fused alongside calibrated synthetic stress-scenarios to benchmark multi-hazard resilience.',
  },
]

const QUICK_ACTIONS = [
  'What should I check next?',
  'Assign this area highest priority',
  'Why is confidence not higher?',
  'Nearest hospital',
]

export const CopilotWidget: React.FC<CopilotWidgetProps> = ({
  activeCity,
  selectedIncident,
  incidents,
  isIncidentOpen,
  onSelectIncident,
  onUpdateOperatorStatus,
  onUpdatePriority,
  hasNewHighIncident = false,
  onClearNewHighBadge,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'helplines' | 'faq'>('chat')
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [inputText, setInputText] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading, activeTab])

  // Keyboard shortcut: Ctrl+K / Cmd+K toggles widget, Esc closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen(prev => {
          const next = !prev
          if (next && onClearNewHighBadge) onClearNewHighBadge()
          return next
        })
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClearNewHighBadge])

  const handleOpenWidget = () => {
    setIsOpen(true)
    if (onClearNewHighBadge) onClearNewHighBadge()
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const handleSendMessage = async (customText?: string, mode: 'chat' | 'summarize_area' | 'summarize_incident' = 'chat') => {
    const textToSend = (customText !== undefined ? customText : inputText).trim()
    if (!textToSend && mode === 'chat') return

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend || (mode === 'summarize_area' ? 'Summarize this area' : 'Summarize this incident'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages(prev => [...prev, userMsg])
    if (customText === undefined) setInputText('')
    setIsLoading(true)
    setActiveTab('chat')

    // Prepare history
    const historyPayload = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    try {
      const response = await sendCopilotMessage({
        message: textToSend,
        mode,
        city: activeCity,
        incident_id: selectedIncident?.incident_id,
        history: historyPayload,
      })

      const botMsg: CopilotMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: response.source,
        suggestions: response.suggestions,
        action: response.action,
      }

      setMessages(prev => [...prev, botMsg])
    } catch {
      const errorMsg: CopilotMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: 'Unable to connect to intelligence engine. Operating in offline mode.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: 'fallback',
        suggestions: ['Summarize this area', 'Emergency helplines'],
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmAction = (msgId: string, action: CopilotAction) => {
    // 1. Mark action as confirmed in UI
    setMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, actionConfirmed: true } : m))
    )

    // 2. Find target incident
    const matched = incidents.find(
      i => i.incident_id.toLowerCase() === action.incident_id.toLowerCase()
    ) || selectedIncident

    if (matched) {
      onSelectIncident(matched)
    }

    // 3. Update operator status or priority
    if (action.type === 'set_status' && action.status) {
      onUpdateOperatorStatus(
        action.incident_id,
        action.status as 'New' | 'Acknowledged' | 'Dispatched' | 'Resolved'
      )
    } else if (action.type === 'set_priority' && action.priority) {
      if (onUpdatePriority) {
        onUpdatePriority(action.incident_id, action.priority)
      }
      onUpdateOperatorStatus(action.incident_id, 'Dispatched')
    }

    // 4. Add muted confirmation system message
    const targetTitle = matched ? matched.title : action.incident_id
    const actionDesc = action.priority ? `Priority ${action.priority}` : action.status || 'Updated'
    const sysMsg: CopilotMessage = {
      id: `sys-${Date.now()}`,
      role: 'system',
      content: `Done: ${targetTitle} escalated to ${actionDesc}.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, sysMsg])
  }

  const handleCancelAction = (msgId: string) => {
    setMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, actionCancelled: true } : m))
    )
  }

  // Format message text with phone link buttons
  const renderFormattedContent = (content: string) => {
    const phoneRegex = /\b(112|100|101|108|1078|1091|1098)\b/g
    const lines = content.split('\n')

    return lines.map((line, lineIdx) => {
      // Split by phone numbers
      const parts = []
      let lastIndex = 0
      let match: RegExpExecArray | null

      phoneRegex.lastIndex = 0
      while ((match = phoneRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index))
        }
        const num = match[1]
        parts.push(
          <a
            key={`phone-${lineIdx}-${match.index}`}
            href={`tel:${num}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono hover:bg-emerald-500/30 transition-colors cursor-pointer"
            title={`Call emergency helpline ${num}`}
          >
            <Phone className="w-2.5 h-2.5 stroke-[2]" />
            <span>{num}</span>
          </a>
        )
        lastIndex = match.index + num.length
      }

      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex))
      }

      return (
        <p key={lineIdx} className={lineIdx > 0 ? 'mt-1' : ''}>
          {parts.map((p, pIdx) => {
            if (typeof p === 'string') {
              // Parse simple markdown bold **text**
              const boldParts = p.split(/(\*\*.*?\*\*)/g)
              return boldParts.map((bp, bpIdx) => {
                if (bp.startsWith('**') && bp.endsWith('**')) {
                  return <strong key={bpIdx} className="font-semibold text-white">{bp.slice(2, -2)}</strong>
                }
                return <span key={bpIdx}>{bp}</span>
              })
            }
            return p
          })}
        </p>
      )
    })
  }

  return (
    <>
      {/* ── 1. LAUNCHER BUTTON ── */}
      <div
        className={`fixed z-30 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isIncidentOpen
            ? 'right-6 md:right-[416px]'
            : 'right-6'
        } bottom-6`}
      >
        <motion.button
          onClick={isOpen ? () => setIsOpen(false) : handleOpenWidget}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={isOpen ? 'Close Copilot (Esc)' : 'Open UrbanFusion Copilot (Ctrl+K)'}
          className="relative w-14 h-14 rounded-full bg-slate-950/90 border border-cyan-500/60 text-white flex items-center justify-center shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:border-cyan-400 hover:shadow-[0_0_32px_rgba(34,211,238,0.4)] backdrop-blur-xl transition-all cursor-pointer outline-none"
        >
          {isOpen ? (
            <X className="w-6 h-6 text-cyan-300 stroke-[2]" />
          ) : (
            <Sparkles className="w-6 h-6 text-cyan-300 stroke-[2]" />
          )}

          {/* New High Incident Accent Dot Badge */}
          {hasNewHighIncident && !isOpen && (
            <span className="absolute top-1 right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 ring-2 ring-slate-950" />
            </span>
          )}
        </motion.button>
      </div>

      {/* ── 2. COPILOT PANEL ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed z-30 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isIncidentOpen
                ? 'right-4 md:right-[416px]'
                : 'right-4 md:right-6'
            } bottom-24 md:bottom-24 w-full md:w-[400px] max-w-[calc(100vw-32px)] h-[560px] max-h-[calc(100vh-120px)] bg-slate-950/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[var(--text)]`}
          >
            {/* Header */}
            <div className="p-3.5 border-b border-white/10 bg-white/5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-300 stroke-[2]" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-white tracking-[-0.02em] flex items-center gap-1.5">
                    <span>UrbanFusion Copilot</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 font-mono">
                      AI
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Control-room operations intelligence
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {messages.length > 0 && activeTab === 'chat' && (
                  <button
                    onClick={() => setMessages([])}
                    title="Clear conversation"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  title="Close (Esc)"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Context Bar */}
            <div className="px-3 py-1.5 bg-black/40 border-b border-white/5 flex items-center gap-1.5 text-[11px] overflow-hidden flex-shrink-0">
              <span className="text-[var(--text-muted)] shrink-0">Context:</span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] shrink-0 uppercase">
                {activeCity === 'all' ? 'All India' : activeCity}
              </span>
              {selectedIncident ? (
                <span
                  className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300 truncate max-w-[200px] text-[10px]"
                  title={selectedIncident.title}
                >
                  {selectedIncident.title}
                </span>
              ) : (
                <span className="text-[10px] text-[var(--text-muted)] italic">
                  No incident selected
                </span>
              )}
            </div>

            {/* Sub-Tabs: Chat / Helplines / FAQ */}
            <div className="flex items-center border-b border-white/5 bg-black/20 text-xs px-2 flex-shrink-0">
              <button
                onClick={() => setActiveTab('chat')}
                className={`py-2 px-3 border-b-2 font-medium transition-colors ${
                  activeTab === 'chat'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-[var(--text-muted)] hover:text-white'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setActiveTab('helplines')}
                className={`py-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition-colors ${
                  activeTab === 'helplines'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-[var(--text-muted)] hover:text-white'
                }`}
              >
                <PhoneCall className="w-3 h-3" />
                <span>Helplines</span>
              </button>
              <button
                onClick={() => setActiveTab('faq')}
                className={`py-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition-colors ${
                  activeTab === 'faq'
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-[var(--text-muted)] hover:text-white'
                }`}
              >
                <HelpCircle className="w-3 h-3" />
                <span>FAQ</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
              {/* TAB 1: CHAT */}
              {activeTab === 'chat' && (
                <>
                  {/* Welcome state when empty */}
                  {messages.length === 0 && (
                    <div className="space-y-3.5 py-2">
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs leading-relaxed text-slate-300">
                        Operational intelligence online. Inquire about causal factors, area prioritization, or emergency helplines.
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleSendMessage(undefined, 'summarize_area')}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-500/10 text-left transition-all group"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-1 group-hover:text-cyan-300">
                            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Summarize area</span>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] leading-tight">
                            Severity counts and top incidents
                          </div>
                        </button>

                        <button
                          onClick={() => handleSendMessage(undefined, 'summarize_incident')}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-500/10 text-left transition-all group"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-1 group-hover:text-cyan-300">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span>Summarize incident</span>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] leading-tight">
                            Key drivers and verification steps
                          </div>
                        </button>

                        <button
                          onClick={() => setActiveTab('helplines')}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-500/10 text-left transition-all group"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-1 group-hover:text-cyan-300">
                            <Phone className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Helplines</span>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] leading-tight">
                            Police, fire, ambulance & NDRF
                          </div>
                        </button>

                        <button
                          onClick={() => handleSendMessage('What are the highest priority incidents?')}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-500/10 text-left transition-all group"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-1 group-hover:text-cyan-300">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                            <span>Highest priority</span>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] leading-tight">
                            Critical multi-sensor alarms
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  {messages.map((m, idx) => {
                    const isLastAssistant = m.role === 'assistant' && idx === messages.length - 1

                    if (m.role === 'system') {
                      return (
                        <div key={m.id} className="text-center my-2 text-[11px] text-cyan-300/80 italic">
                          {m.content}
                        </div>
                      )
                    }

                    if (m.role === 'user') {
                      return (
                        <div key={m.id} className="flex justify-end">
                          <div className="bg-cyan-500/20 border border-cyan-500/30 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[85%] text-xs leading-relaxed shadow-sm">
                            {m.content}
                            <div className="text-[9px] text-cyan-200/60 mt-1 text-right font-mono">
                              {m.timestamp}
                            </div>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={m.id} className="space-y-2">
                        <div className="bg-white/5 border border-white/10 text-[var(--text)] rounded-2xl rounded-tl-sm p-3.5 max-w-[95%] text-xs leading-relaxed shadow-sm">
                          <div className="space-y-1">
                            {renderFormattedContent(m.content)}
                          </div>

                          {/* Action Card */}
                          {m.action && !m.actionCancelled && (
                            <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-cyan-500/40 space-y-2.5">
                              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span>
                                  {m.action.priority
                                    ? `Escalate ${m.action.incident_id} to ${m.action.priority}?`
                                    : `Set ${m.action.incident_id} to ${m.action.status}?`}
                                </span>
                              </div>
                              <div className="text-[11px] text-[var(--text-muted)]">
                                Confirm operational dispatch and escalation across command feeds.
                              </div>

                              {m.actionConfirmed ? (
                                <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 pt-1">
                                  <Check className="w-3.5 h-3.5 stroke-[2]" />
                                  <span>Action executed</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    onClick={() => handleConfirmAction(m.id, m.action!)}
                                    className="h-8 px-3 rounded-lg bg-slate-950/90 border border-cyan-500/60 text-white font-semibold text-xs shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:border-cyan-400 hover:shadow-[0_0_32px_rgba(34,211,238,0.4)] active:scale-[0.98] transition-all cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => handleCancelAction(m.id)}
                                    className="px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-white transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Footer: Source + Copy */}
                          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                            <span>{m.source === 'groq' ? 'Groq (llama-3.3-70b)' : 'Offline mode'}</span>
                            <button
                              onClick={() => handleCopy(m.id, m.content)}
                              className="hover:text-white transition-colors flex items-center gap-1"
                              title="Copy response"
                            >
                              {copiedId === m.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Suggestions Chips on last assistant reply */}
                        {isLastAssistant && m.suggestions && m.suggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {m.suggestions.map((sug, sIdx) => (
                              <button
                                key={sIdx}
                                onClick={() => handleSendMessage(sug)}
                                className="text-[11px] px-2.5 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all text-left"
                              >
                                {sug}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Typing indicator */}
                  {isLoading && (
                    <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-white/5 border border-white/10 w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}

              {/* TAB 2: HELPLINES */}
              {activeTab === 'helplines' && (
                <div className="space-y-2.5">
                  <div className="text-xs text-[var(--text-muted)] pb-1 border-b border-white/10">
                    Official Emergency Helpline Numbers (India)
                  </div>
                  {INDIAN_HELPLINES.map((h, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between hover:bg-white/10 transition-colors"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white">{h.name}</div>
                        <div className="text-[11px] text-[var(--text-muted)]">{h.desc}</div>
                      </div>
                      <a
                        href={`tel:${h.number}`}
                        className="h-8 px-3 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 flex items-center gap-1.5 text-xs font-mono font-semibold transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{h.number}</span>
                      </a>
                    </div>
                  ))}
                  <div className="text-[11px] text-[var(--text-muted)] italic pt-1 text-center">
                    City-specific numbers: verify with local authority.
                  </div>
                </div>
              )}

              {/* TAB 3: FAQ */}
              {activeTab === 'faq' && (
                <div className="space-y-2">
                  <div className="text-xs text-[var(--text-muted)] pb-1 border-b border-white/10">
                    Control Room Intelligence FAQ
                  </div>
                  {FAQ_ITEMS.map((item, i) => {
                    const isExpanded = expandedFaq === i
                    return (
                      <div
                        key={i}
                        className="rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all"
                      >
                        <button
                          onClick={() => setExpandedFaq(isExpanded ? null : i)}
                          className="w-full p-2.5 flex items-center justify-between text-left text-xs font-medium text-white hover:bg-white/5 transition-colors"
                        >
                          <span>{item.q}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 ml-2" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 text-[11px] leading-relaxed text-slate-300 border-t border-white/5 pt-2">
                            {item.a}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick Action Chips Row above input (only on Chat tab) */}
            {activeTab === 'chat' && (
              <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-white/5 flex-shrink-0">
                {QUICK_ACTIONS.map((actionText, aIdx) => (
                  <button
                    key={aIdx}
                    onClick={() => handleSendMessage(actionText)}
                    disabled={isLoading}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white whitespace-nowrap transition-colors shrink-0 disabled:opacity-40"
                  >
                    {actionText}
                  </button>
                ))}
              </div>
            )}

            {/* Input Bar (only on Chat tab) */}
            {activeTab === 'chat' && (
              <div className="p-3 border-t border-white/10 bg-black/40 flex items-end gap-2 flex-shrink-0">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Ask Copilot (e.g. check next, helplines)..."
                  rows={1}
                  className="flex-1 max-h-20 min-h-[36px] p-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-cyan-400/80 resize-none transition-colors"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !inputText.trim()}
                  className="w-9 h-9 rounded-xl bg-slate-950/90 border border-cyan-500/60 text-white flex items-center justify-center hover:border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
                  title="Send message (Enter)"
                >
                  <Send className="w-3.5 h-3.5 text-cyan-300 stroke-[2]" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
