import React from 'react'

export function toSentenceCase(str: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export const Label: React.FC<{
  children: React.ReactNode
  className?: string
}> = ({ children, className = '' }) => {
  return (
    <span className={`text-[12px] uppercase text-[var(--text-muted)] font-medium tracking-[0.08em] select-none ${className}`}>
      {children}
    </span>
  )
}

export const SectionLabel = Label

export const Stat: React.FC<{
  value: React.ReactNode
  label: string
  className?: string
}> = ({ value, label, className = '' }) => (
  <div className={`flex flex-col select-none ${className}`}>
    <span className="text-[20px] font-semibold text-[var(--text)] leading-tight">{value}</span>
    <span className="text-[11px] text-[var(--text-muted)] leading-tight">{toSentenceCase(label)}</span>
  </div>
)

export const Row: React.FC<{
  icon: React.ReactNode
  text: React.ReactNode
  right?: React.ReactNode
  className?: string
}> = ({ icon, text, right, className = '' }) => (
  <div className={`flex items-center gap-2 py-1 select-none text-[13px] text-[var(--text)] ${className}`}>
    <span className="text-[var(--text-muted)] shrink-0 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4 [&>svg]:stroke-[1.5]">
      {icon}
    </span>
    <span className="truncate leading-normal flex-1">{text}</span>
    {right !== undefined && (
      <span className="text-[13px] text-[var(--text-muted)] shrink-0 ml-auto leading-normal">{right}</span>
    )}
  </div>
)

export const SeverityChip: React.FC<{
  level?: string
  className?: string
}> = ({ level = 'Medium', className = '' }) => {
  const l = (level || 'Medium').toLowerCase()
  const colorClass =
    l === 'high' || l === 'critical'
      ? 'bg-rose-500/20 text-[var(--sev-high)] border-rose-500/40'
      : l === 'medium'
      ? 'bg-amber-500/20 text-[var(--sev-med)] border-amber-500/40'
      : 'bg-yellow-500/20 text-[var(--sev-low)] border-yellow-500/40'

  const label = l.charAt(0).toUpperCase() + l.slice(1)
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border select-none ${colorClass} ${className}`}
    >
      {label}
    </span>
  )
}

export const IconButton: React.FC<{
  icon?: React.ReactNode
  children?: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  title?: string
  className?: string
  disabled?: boolean
  active?: boolean
}> = ({ icon, children, onClick, title, className = '', disabled, active }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center border transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
      active
        ? 'border-[var(--accent)] text-[var(--accent)] bg-cyan-500/10'
        : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] hover:bg-white/5'
    } [&>svg]:w-5 [&>svg]:h-5 [&>svg]:stroke-[1.5] ${className}`}
  >
    {icon || children}
  </button>
)
