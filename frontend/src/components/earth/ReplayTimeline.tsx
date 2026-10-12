import React, { useState, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, X, TrendingUp, Sparkles } from 'lucide-react'
import type { V1Incident } from '../../api'
import { fetchV1Replay } from '../../api'
import { formatCause, formatSourceType } from '../../utils/formatters'
import { Label } from '../../ui/primitives'

interface ReplayTimelineProps {
  incident: V1Incident | null
  onClose: () => void
}

export const ReplayTimeline: React.FC<ReplayTimelineProps> = ({ incident, onClose }) => {
  const [steps, setSteps] = useState<any[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)

  useEffect(() => {
    if (!incident) return
    let active = true

    async function loadReplay() {
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
      }
    }

    loadReplay()

    return () => {
      active = false
    }
  }, [incident])

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
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30 w-[92vw] max-w-2xl bg-[var(--bg-panel)] backdrop-blur-2xl border border-[var(--border)] rounded-2xl shadow-2xl p-3.5 text-[var(--text)] pointer-events-auto">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)] stroke-[1.5]" />
          <span className="text-xs font-semibold text-[var(--text)]">
            Causal replay — {incident.incident_id}
          </span>
          <Label>
            (Step {currentStepIndex + 1} of {steps.length})
          </Label>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <X className="w-3.5 h-3.5 stroke-[1.5]" />
        </button>
      </div>

      {/* Playback Controls & Confidence Progress */}
      <div className="flex items-center gap-4">
        {/* Play/Pause/Skip Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
            disabled={currentStepIndex === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <SkipBack className="w-4 h-4 stroke-[1.5]" />
          </button>
          <button
            onClick={() => setIsPlaying(prev => !prev)}
            className="p-2 rounded-xl bg-[var(--accent)] hover:opacity-90 text-slate-950 font-semibold shadow-md transition-opacity"
          >
            {isPlaying ? <Pause className="w-4 h-4 stroke-[1.5]" /> : <Play className="w-4 h-4 stroke-[1.5] fill-current" />}
          </button>
          <button
            onClick={() => setCurrentStepIndex(prev => Math.min(steps.length - 1, prev + 1))}
            disabled={currentStepIndex === steps.length - 1}
            className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <SkipForward className="w-4 h-4 stroke-[1.5]" />
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
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span className="truncate max-w-[280px] text-[var(--text)]">
              {currentStep.event?.source_type && (
                <span className="text-[var(--text-muted)] font-medium mr-1.5">
                  {formatSourceType(currentStep.event.source_type)}:
                </span>
              )}
              {currentStep.event?.payload?.description || currentStep.event?.payload?.text || 'Signal telemetry received'}
            </span>
            <span className="font-medium text-[var(--accent)] whitespace-nowrap ml-2">
              {formatCause(currentStep.primary_cause)}
            </span>
          </div>
        </div>

        {/* Confidence Climb Indicator */}
        <div className="flex items-center gap-2 pl-3 border-l border-[var(--border)] shrink-0">
          <TrendingUp className="w-4 h-4 text-[var(--ok)] stroke-[1.5]" />
          <div>
            <Label>Confidence</Label>
            <div className="text-sm font-semibold text-[var(--ok)] leading-none">
              {confPct}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
