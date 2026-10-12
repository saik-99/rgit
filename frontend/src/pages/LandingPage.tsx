import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, ShieldCheck, GitMerge, BrainCircuit, ArrowRight, Play, CloudRain, Layers, Radio, Sparkles, CheckCircle2 } from 'lucide-react'
import { runScenario } from '../api'

export const LandingPage: React.FC = () => {
  const navigate = useNavigate()

  const handleRunDemo = async () => {
    await runScenario('drainage_failure')
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors">
      
      {/* ── Esri-Style Hero Section ───────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1B3A57] via-[#0079C1] to-[#128a50] text-white pt-20 pb-28 px-4 sm:px-6 lg:px-8 shadow-xl">
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />
        
        <div className="max-w-6xl mx-auto relative z-10 text-center sm:text-left">
          <div className="inline-flex items-center space-x-2 bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider text-sky-200 border border-white/20 mb-6">
            <Radio className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
            <span>Next-Gen Municipal Fusion Engine</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight max-w-4xl text-white font-display mb-6">
            From scattered signals to <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-teal-200 to-emerald-300">
              one clear incident.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-100/90 max-w-2xl font-normal leading-relaxed mb-10">
            Cities continuously generate fragmented alerts across water sensors, traffic loops, 311 citizen reports, and weather telemetry. Our multimodal causal AI correlates them in real time into one evolving incident graph, infers the root cause, and eliminates dashboard noise.
          </p>

          <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Link
              to="/dashboard"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white text-[#0079C1] hover:bg-slate-50 font-bold text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-center space-x-2 group"
            >
              <span>Open Dashboard</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>

            <button
              onClick={handleRunDemo}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-center space-x-2"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Run Mumbai Drainage Demo</span>
            </button>
          </div>

          {/* Quick Stats Pill */}
          <div className="mt-12 pt-8 border-t border-white/20 grid grid-cols-2 md:grid-cols-4 gap-6 text-slate-200 text-left">
            <div>
              <div className="text-2xl font-extrabold text-white">100%</div>
              <div className="text-xs text-sky-200 font-medium">HMAC-SHA256 Verified</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">500m</div>
              <div className="text-xs text-sky-200 font-medium">H3 Spatial Clustering</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">Noisy-OR</div>
              <div className="text-xs text-sky-200 font-medium">Probabilistic Root Cause</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">Open-Meteo</div>
              <div className="text-xs text-sky-200 font-medium">Live Hydro-Meteorology</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── "How It Works" Pipeline Strip ───────────────────────────── */}
      <section className="bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-xs font-bold tracking-widest uppercase text-slate-400 dark:text-slate-500 mb-4 text-center sm:text-left">
            Real-Time Processing Pipeline
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-center sm:text-left">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/60 flex items-center space-x-3">
              <span className="w-7 h-7 rounded-full bg-[#0079C1]/15 text-[#0079C1] font-bold text-xs flex items-center justify-center shrink-0">1</span>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Heterogeneous Ingest</div>
                <div className="text-[11px] text-slate-500">IoT, 311, GPS, Weather</div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/60 flex items-center space-x-3">
              <span className="w-7 h-7 rounded-full bg-[#0079C1]/15 text-[#0079C1] font-bold text-xs flex items-center justify-center shrink-0">2</span>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Validate & Dedupe</div>
                <div className="text-[11px] text-slate-500">HMAC checks + z-score</div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/60 flex items-center space-x-3">
              <span className="w-7 h-7 rounded-full bg-[#0079C1]/15 text-[#0079C1] font-bold text-xs flex items-center justify-center shrink-0">3</span>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Spatio-Temporal Cluster</div>
                <div className="text-[11px] text-slate-500">500m & 30m window</div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/60 flex items-center space-x-3">
              <span className="w-7 h-7 rounded-full bg-[#0079C1]/15 text-[#0079C1] font-bold text-xs flex items-center justify-center shrink-0">4</span>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Causal Inference</div>
                <div className="text-[11px] text-slate-500">Noisy-OR model</div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/60 flex items-center space-x-3">
              <span className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0">5</span>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Operator Briefing</div>
                <div className="text-[11px] text-slate-500">Plain language & GIS</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3 Core Pillars Section ───────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto flex-1">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold tracking-tight font-display mb-3">
            Designed for Municipal Decision Velocity
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto text-base">
            Instead of bombarding dispatchers with four uncoordinated sirens, our engine preserves uncertainty and presents an evolving causal situation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Card 1: Fuse */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-[#0079C1] flex items-center justify-center mb-5">
              <GitMerge className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold font-display mb-2">1. Multimodal Fusion</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">
              Correlates road inductive loops, BEST transit telemetry, ultrasonic drainage sensors, and citizen hotline 311 calls into single spatial clusters.
            </p>
            <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-400">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Handles out-of-order event arrivals</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Automatic duplicate deduplication</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>HMAC signature verification & trust gating</span>
              </li>
            </ul>
          </div>

          {/* Card 2: Infer */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-5">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold font-display mb-2">2. Causal Intelligence</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">
              Constrained domain vocabulary matches against drainage failure, road accidents, grid power outages, and road blockages with noisy-OR probability.
            </p>
            <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-400">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Noisy-OR causal graph with priors</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Tracks supporting vs contradictory evidence</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Live hydro-meteorological corroboration</span>
              </li>
            </ul>
          </div>

          {/* Card 3: Explain */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-7 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-5">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold font-display mb-2">3. GIS Operator Briefing</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-4">
              Produces confidence-aware plain language summaries for command center operators alongside Google Flood Hub-style flood polygon overlays.
            </p>
            <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-400">
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>ArcGIS Online & Google Flood Hub UI language</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Time-scrub slider with replay playback</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Full evidence trace & sensor audit</span>
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between">
          <span>Urban Incident Fusion & Causal Intelligence • Hackathon Prototype</span>
          <span className="mt-2 sm:mt-0">Dadar · Hindmata · Milan Subway · Sion GIS Testbed</span>
        </div>
      </footer>

    </div>
  )
}
