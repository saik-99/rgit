import React, { useState } from 'react'
import { Wind, CloudRain, Cloud, Waves, X, Maximize2, Minimize2, ExternalLink, Info } from 'lucide-react'
import type { WindyConfig } from '../types'

interface WindyPanelProps {
  config: WindyConfig
  onClose: () => void
}

export const WindyPanel: React.FC<WindyPanelProps> = ({ config, onClose }) => {
  const [selectedOverlay, setSelectedOverlay] = useState<string>('rain')
  const [isMinimized, setIsMinimized] = useState<boolean>(false)

  // Mumbai coordinates
  const lat = 19.0760
  const lon = 72.8777

  const iframeSrc = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&width=650&height=450&zoom=10&level=surface&overlay=${selectedOverlay}&product=ecmwf&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`

  return (
    <div className={`absolute bottom-24 right-4 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all duration-200 ${
      isMinimized ? 'w-80 h-14' : 'w-[360px] sm:w-[480px] h-[380px] sm:h-[440px]'
    }`}>
      
      {/* Top Header */}
      <div className="px-3.5 py-2.5 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-red-500 flex items-center justify-center text-white shadow-xs">
            <Wind className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-xs font-extrabold text-slate-800 dark:text-white leading-none">
              Windy.com Atmospheric Radar
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {config.has_key ? 'Native Leaflet API Mode' : 'Official Embed Mode (Mumbai)'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Close Windy layer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex flex-col h-[calc(100%-42px)]">
          {/* Overlay Selector Bar */}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-1">
              {[
                { id: 'rain', label: 'Rain / Thunder', icon: CloudRain },
                { id: 'wind', label: 'Wind Particles', icon: Wind },
                { id: 'clouds', label: 'Clouds', icon: Cloud },
                { id: 'waves', label: 'Waves', icon: Waves },
              ].map((item) => {
                const Icon = item.icon
                const active = selectedOverlay === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedOverlay(item.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center space-x-1 transition-colors ${
                      active
                        ? 'bg-[#0079C1] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                )
              })}
            </div>

            <a
              href="https://www.windy.com"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-slate-400 hover:text-sky-600 flex items-center space-x-0.5 font-medium ml-1"
            >
              <span>Windy.com</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>

          {/* Iframe Viewport */}
          <div className="flex-1 relative bg-slate-950">
            <iframe
              src={iframeSrc}
              title="Windy.com Hazard Overlay"
              className="w-full h-full border-0"
              loading="lazy"
            />
          </div>

          {/* Attribution & Notice Strip */}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center space-x-1">
              <Info className="w-3 h-3 text-slate-400 shrink-0" />
              <span>{config.sync_note}</span>
            </span>
            <span className="italic font-medium">{config.attribution}</span>
          </div>
        </div>
      )}

    </div>
  )
}
