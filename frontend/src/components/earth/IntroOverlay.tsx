import React, { useState, useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { Stat } from '../../ui/primitives'

interface IntroOverlayProps {
  mapReady: boolean
  stats?: any
  incidentsCount?: number
  onStartEnter: () => void
  isExiting: boolean
}

function useCountUp(target: number, durationMs: number, active: boolean, prefersReducedMotion: boolean) {
  const [value, setValue] = useState<number>(prefersReducedMotion ? target : 0)

  useEffect(() => {
    if (!active) return
    if (prefersReducedMotion) {
      setValue(target)
      return
    }

    let start: number | null = null
    let rafId: number

    const step = (now: number) => {
      if (!start) start = now
      const elapsed = now - start
      const progress = Math.min(1, elapsed / durationMs)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) {
        rafId = requestAnimationFrame(step)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [target, durationMs, active, prefersReducedMotion])

  return value
}

export const IntroOverlay: React.FC<IntroOverlayProps> = ({
  mapReady,
  stats,
  incidentsCount,
  onStartEnter,
  isExiting,
}) => {
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Timeline stage states
  const [stageLabel, setStageLabel] = useState<boolean>(false)
  const [stageTitle, setStageTitle] = useState<boolean>(false)
  const [stageTagline, setStageTagline] = useState<boolean>(false)
  const [stageStats, setStageStats] = useState<boolean>(false)
  const [stageAction, setStageAction] = useState<boolean>(false)
  const [stageFooter, setStageFooter] = useState<boolean>(false)
  const [blackFadeOut, setBlackFadeOut] = useState<boolean>(false)

  const hasTriggeredRef = useRef<boolean>(false)

  // Start timeline once mapReady is true
  useEffect(() => {
    if (!mapReady) return

    // 0.0s: black -> globe fades in (1.2s)
    setBlackFadeOut(true)

    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setStageLabel(true), prefersReducedMotion ? 100 : 800),
      setTimeout(() => setStageTitle(true), prefersReducedMotion ? 150 : 1000),
      setTimeout(() => setStageTagline(true), prefersReducedMotion ? 200 : 1300),
      setTimeout(() => setStageStats(true), prefersReducedMotion ? 250 : 1800),
      setTimeout(() => setStageAction(true), prefersReducedMotion ? 300 : 2400),
      setTimeout(() => setStageFooter(true), prefersReducedMotion ? 350 : 2600),
    ]

    return () => {
      timers.forEach(clearTimeout)
    }
  }, [mapReady, prefersReducedMotion])

  // Handle enter key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleEnter()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleEnter = () => {
    if (hasTriggeredRef.current) return
    hasTriggeredRef.current = true
    onStartEnter()
  }

  // Count-up calculations (1.4s ease out)
  const targetIncidents = stats?.total_incidents ?? incidentsCount ?? 1327
  const targetSignals =
    stats?.total_events ??
    (stats?.real_vs_synthetic
      ? (stats.real_vs_synthetic.real ?? 0) + (stats.real_vs_synthetic.synthetic ?? 0)
      : 3218)
  const targetCities = 7

  const countIncidents = useCountUp(targetIncidents, 1400, stageStats, prefersReducedMotion)
  const countSignals = useCountUp(targetSignals, 1400, stageStats, prefersReducedMotion)
  const countCities = useCountUp(targetCities, 1400, stageStats, prefersReducedMotion)

  const incidentsFormatted = stats || incidentsCount !== undefined ? countIncidents.toLocaleString() : '—'
  const signalsFormatted = stats ? countSignals.toLocaleString() : '—'
  const citiesFormatted = countCities.toLocaleString()

  // Transitions: entrance ease-out-expo, exit ease-in
  const easeEntrance = 'cubic-bezier(0.16, 1, 0.3, 1)'
  const easeExit = 'cubic-bezier(0.7, 0, 0.84, 0)'

  const getItemStyle = (active: boolean, exitIndex: number, durationMs = 700) => {
    if (isExiting) {
      return {
        opacity: 0,
        transform: 'translateY(-12px)',
        transition: `opacity 350ms ${easeExit} ${exitIndex * 60}ms, transform 350ms ${easeExit} ${exitIndex * 60}ms`,
        willChange: 'transform, opacity',
      }
    }
    if (!active) {
      return {
        opacity: 0,
        transform: prefersReducedMotion ? 'translateY(0)' : 'translateY(16px)',
        willChange: 'transform, opacity',
      }
    }
    return {
      opacity: 1,
      transform: 'translateY(0)',
      transition: `opacity ${durationMs}ms ${easeEntrance}, transform ${durationMs}ms ${easeEntrance}`,
    }
  }

  return (
    <div className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden">
      {/* 1. Subtle static star field */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 transition-opacity duration-1000"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 30px 45px, rgba(255,255,255,0.7), transparent),
            radial-gradient(1.5px 1.5px at 160px 110px, rgba(34,211,238,0.75), transparent),
            radial-gradient(1px 1px at 340px 90px, rgba(255,255,255,0.6), transparent),
            radial-gradient(1px 1px at 470px 240px, rgba(255,255,255,0.5), transparent),
            radial-gradient(1.5px 1.5px at 620px 80px, rgba(255,255,255,0.8), transparent),
            radial-gradient(1px 1px at 820px 210px, rgba(34,211,238,0.7), transparent),
            radial-gradient(1px 1px at 980px 95px, rgba(255,255,255,0.65), transparent),
            radial-gradient(1px 1px at 1160px 270px, rgba(255,255,255,0.7), transparent),
            radial-gradient(1.5px 1.5px at 1340px 140px, rgba(255,255,255,0.85), transparent),
            radial-gradient(1px 1px at 1480px 70px, rgba(34,211,238,0.65), transparent)
          `,
          backgroundSize: '560px 380px',
        }}
      />

      {/* 2. Thin blue atmospheric limb halo over globe edge */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
        style={{
          background: 'radial-gradient(circle at 64% 50%, rgba(34, 211, 238, 0.08) 0%, rgba(14, 36, 58, 0.12) 36%, transparent 62%)',
          opacity: isExiting ? 0 : 1,
        }}
      />

      {/* 3. Soft dark vignette on left half behind text */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-[3000ms]"
        style={{
          background: 'linear-gradient(to right, rgba(5, 8, 15, 0.94) 0%, rgba(5, 8, 15, 0.85) 32%, rgba(5, 8, 15, 0.45) 58%, transparent 100%)',
          opacity: isExiting ? 0 : 1,
        }}
      />

      {/* 4. Pure black loading curtain with thin 1px accent progress line */}
      <div
        className="absolute inset-0 bg-[#050811] z-50 flex flex-col items-center justify-center transition-opacity duration-[1200ms]"
        style={{
          opacity: blackFadeOut ? 0 : 1,
          pointerEvents: blackFadeOut ? 'none' : 'auto',
        }}
      >
        <div className="w-48 sm:w-64 h-[1px] bg-white/10 overflow-hidden relative rounded-full">
          <div className="absolute inset-0 bg-[var(--accent)] animate-[pulse_1.5s_ease-in-out_infinite]" />
        </div>
      </div>

      {/* 5. Main Hero Content Layout */}
      <div className="relative z-20 h-full w-full max-w-7xl mx-auto px-6 sm:px-12 md:px-16 flex flex-col justify-center">
        <div className="max-w-2xl text-left flex flex-col items-start space-y-6">
          {/* 0.8s: Category / System Label */}
          <div
            style={getItemStyle(stageLabel, 0, 500)}
            className="text-[12px] uppercase text-[var(--text-muted)] font-medium tracking-[0.08em]"
          >
            Urban incident intelligence
          </div>

          {/* 1.0s: Main Product Title */}
          <h1
            style={getItemStyle(stageTitle, 1, 800)}
            className="text-[40px] md:text-[64px] font-semibold tracking-[-0.02em] leading-[1.05] text-[var(--text)] m-0"
          >
            UrbanFusion
          </h1>

          {/* 1.3s: Calm, cinematic Tagline */}
          <p
            style={getItemStyle(stageTagline, 2, 700)}
            className="text-[16px] md:text-[18px] text-[var(--text-muted)] max-w-[440px] leading-relaxed m-0 font-normal"
          >
            Thousands of city signals. One clear picture of what is happening and why.
          </p>

          {/* 1.8s: 3 Key Live Statistics counting up over 1.4s */}
          <div
            style={getItemStyle(stageStats, 3, 700)}
            className="flex items-center gap-6 sm:gap-8 pt-3 pb-1"
          >
            <Stat value={incidentsFormatted} label="Incidents detected" />
            <div className="w-[1px] h-9 bg-white/10 shrink-0" />
            <Stat value={signalsFormatted} label="Signals fused" />
            <div className="w-[1px] h-9 bg-white/10 shrink-0" />
            <Stat value={citiesFormatted} label="Cities monitored" />
          </div>

          {/* 2.4s: Action controls */}
          <div
            style={getItemStyle(stageAction, 4, 600)}
            className="flex flex-wrap items-center gap-4 pt-2 pointer-events-auto"
          >
            <button
              onClick={handleEnter}
              className="group h-11 px-6 rounded-xl bg-slate-950/90 hover:bg-cyan-950/40 font-semibold text-sm flex items-center gap-2.5 border border-cyan-500/60 hover:border-cyan-400 transition-all duration-300 shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:shadow-[0_0_32px_rgba(34,211,238,0.4)] active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer backdrop-blur-xl"
              style={{ color: '#ffffff' }}
            >
              <span className="text-white group-hover:text-cyan-200 transition-colors">Enter control room</span>
              <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:text-cyan-200 group-hover:translate-x-1 transition-all duration-300 stroke-[2]" />
            </button>

            <span className="text-[11px] text-[var(--text-muted)] font-normal hidden sm:inline select-none">
              Press Enter
            </span>

            <button
              onClick={handleEnter}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors underline underline-offset-4 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] rounded py-1 px-2"
            >
              Skip intro
            </button>
          </div>

          {/* 2.6s: Footer Signals Summary */}
          <div
            style={getItemStyle(stageFooter, 5, 500)}
            className="pt-4 text-[12px] text-[var(--text-muted)] tracking-normal font-normal"
          >
            Rain · Sensors · Citizen reports · Transit · AI cause inference
          </div>
        </div>
      </div>
    </div>
  )
}
