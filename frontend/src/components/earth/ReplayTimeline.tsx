import React, { useState, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, X, TrendingUp, Sparkles } from 'lucide-react'
import type { V1Incident } from '../../api'
import { fetchV1Replay } from '../../api'
import { formatCause, formatSourceType } from '../../utils/formatters'

interface ReplayTimelineProps {
  incident: V1Incident | null
  onClose: () => void
}

export const ReplayTimeline: React.FC<ReplayTimelineProps> = ({ incident, onClose }) => {
  const [steps, setSteps] = useState<any[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    if (!incident) return
    let active = true

    async function loadReplay() {
      setLoading(true)
      try {
        const data = await fetchV1Replay(incident!.incident_id)
        if (active) {
          if (data && data.steps && data.steps.length > 0) {
            setSteps(data.steps)
            setCurrentStepIndex(data.steps.length - 1)
          } else {
            setSteps([])
          }
        }
      } catch {
        if (active) setSteps([])
      } finally {
        if (active) setLoading(false)
      }
    }

    loadReplay()

    return () => {
      active = false
    }
  }, [incident])

  // Playback timer
  useEffect(() => {
    if (!isPlaying || steps.length === 0) return

    const interval = setInterval(() => {
      setCurrentStepIndex(prev => {
        if (prev >= steps.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, 1800)

    return () => clearInterval(interval)
  }, [isPlaying, steps])

  if (!incident || steps.length === 0) return null

  const currentStep = steps[currentStepIndex] || steps[0]
  const confPct = Math.round((currentStep.confidence || 0) * 100)

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30 w-[92vw] max-w-2xl bg-slate-950/85 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-3.5 text-white pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-cyan-500/20 text-cyan-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Causal Replay — {incident.incident_id}
          </span>
          <span className="text-[11px] text-slate-400">
            (Step {currentStepIndex + 1} of {steps.length})
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Playback Controls & Confidence Progress */}
      <div className="flex items-center gap-4">
        {/* Play/Pause/Skip Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
            disabled={currentStepIndex === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsPlaying(prev => !prev)}
            className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-md transition-colors"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          </button>
          <button
            onClick={() => setCurrentStepIndex(prev => Math.min(steps.length - 1, prev + 1))}
            disabled={currentStepIndex === steps.length - 1}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Step Slider */}
        <div className="flex-1 space-y-1">
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={currentStepIndex}
            onChange={e => setCurrentStepIndex(Number(e.target.value))}
            className="w-full accent-cyan-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="line-clamp-1 max-w-[280px] text-slate-200">
              {currentStep.event?.source_type && (
                <strong className="text-cyan-300 font-semibold mr-1.5">
                  {formatSourceType(currentStep.event.source_type)}:
                </strong>
              )}
              {currentStep.event?.payload?.description || currentStep.event?.payload?.text || 'Signal telemetry received'}
            </span>
            <span className="font-semibold text-cyan-300 whitespace-nowrap ml-2">
              {formatCause(currentStep.primary_cause)}
            </span>
          </div>
        </div>

        {/* Confidence Climb Indicator */}
        <div className="flex items-center gap-2 pl-3 border-l border-white/10 flex-shrink-0">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-mono tracking-tighter">Confidence</div>
            <div className="text-sm font-bold font-mono text-emerald-400 leading-none">
              {confPct}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
