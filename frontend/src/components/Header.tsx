import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Activity, ShieldAlert, CloudRain, Sun, Moon, Database, ExternalLink, RefreshCw } from 'lucide-react'
import { fetchWeather, MOCK_WEATHER } from '../api'
import type { WeatherMetrics } from '../types'

interface HeaderProps {
  onRefresh?: () => void
}

export const Header: React.FC<HeaderProps> = ({ onRefresh }) => {
  const location = useLocation()
  const [darkMode, setDarkMode] = useState(false)
  const [weather, setWeather] = useState<WeatherMetrics>(MOCK_WEATHER)
  const [isLive, setIsLive] = useState(true)

  useEffect(() => {
    fetchWeather().then(setWeather)
    const interval = setInterval(() => {
      fetchWeather().then(setWeather)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const toggleDarkMode = () => {
    const isDark = !darkMode
    setDarkMode(isDark)
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  return (
    <header className="bg-[#1B3A57] text-white border-b border-slate-700 shadow-md sticky top-0 z-50 transition-colors">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        {/* Left: Brand & GIS Logo */}
        <div className="flex items-center space-x-4">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-lg bg-[#0079C1] flex items-center justify-center shadow-lg group-hover:bg-[#008de0] transition-colors">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base tracking-tight text-white font-display">
                  URBAN FUSION
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-[#35AC46]/30 text-[#4ade80] px-1.5 py-0.5 rounded border border-[#35AC46]/40">
                  GIS AI
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium hidden sm:block">
                Causal Incident Intelligence Platform
              </p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 pl-6 border-l border-slate-600/60 text-sm font-medium">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded-md transition-colors ${
                location.pathname === '/'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              Overview
            </Link>
            <Link
              to="/dashboard"
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1.5 ${
                location.pathname === '/dashboard'
                  ? 'bg-[#0079C1] text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Activity className="w-4 h-4 text-sky-300" />
              <span>Operations Map</span>
            </Link>
            <Link
              to="/sources"
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1.5 ${
                location.pathname === '/sources'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Sensors & Sources</span>
            </Link>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/10 flex items-center space-x-1 transition-colors"
            >
              <span>API Specs</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </nav>
        </div>

        {/* Right: Telemetry & Controls */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          
          {/* Weather Indicator Pill */}
          {weather && (
            <div className="hidden lg:flex items-center space-x-2 bg-slate-800/80 border border-slate-600/70 rounded-full px-3 py-1 text-xs">
              <CloudRain className="w-4 h-4 text-sky-400 animate-pulse" />
              <span className="font-medium text-slate-200">
                Mumbai: <strong className="text-white">{(weather.past_24h_rainfall_mm ?? 112).toFixed(0)}mm / 24h</strong>
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-amber-300 font-semibold flex items-center space-x-1">
                <span>Flood Risk: {weather.flood_risk_level || 'High'}</span>
              </span>
            </div>
          )}

          {/* Live WS Status */}
          <div className="flex items-center space-x-2 bg-slate-900/60 px-2.5 py-1 rounded-full border border-slate-700/80 text-xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300 font-mono text-[11px] font-semibold">ENGINE LIVE</span>
          </div>

          {/* Quick Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh telemetry"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 transition-colors border border-slate-700"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-slate-300" />}
          </button>
        </div>

      </div>
    </header>
  )
}
