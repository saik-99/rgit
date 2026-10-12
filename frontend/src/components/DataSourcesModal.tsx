import React, { useState, useEffect } from 'react'
import { ShieldCheck, AlertCircle, ExternalLink, X, Database } from 'lucide-react'
import { fetchDataSources } from '../api'
import type { DataSourceItem } from '../types'

interface DataSourcesModalProps {
  isOpen: boolean
  onClose: () => void
}

export const DataSourcesModal: React.FC<DataSourcesModalProps> = ({ isOpen, onClose }) => {
  const [sources, setSources] = useState<DataSourceItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      fetchDataSources().then(data => {
        setSources(data)
        setLoading(false)
      })
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0079C1] flex items-center justify-center text-white">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white font-display">
                External Data Sources & Attributions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live provider statuses, licensing, and attribution compliance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-6 overflow-y-auto space-y-4">
          {loading ? (
            <div className="text-center py-8 text-xs text-slate-500">Loading data source registries...</div>
          ) : (
            sources.map((src) => (
              <div
                key={src.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2 text-xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {src.name}
                    </span>
                    <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {src.type}
                    </span>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase flex items-center space-x-1 ${
                    src.status === 'live'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : src.status === 'fallback'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {src.status === 'live' ? <ShieldCheck className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    <span>{src.status}</span>
                  </span>
                </div>

                <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                  {src.description}
                </p>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span><strong>License:</strong> {src.license}</span>
                  <span className="italic text-slate-700 dark:text-slate-300">"{src.attribution}"</span>
                  <a
                    href={src.endpoint}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0079C1] hover:underline flex items-center space-x-1 font-semibold"
                  >
                    <span>Provider Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs text-slate-500">
          <span>All providers accessed in strict accordance with open licensing terms.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#0079C1] hover:bg-[#008de0] text-white font-semibold transition-colors shadow-xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  )
}
