import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Loader2, X, Sun, Moon, Laptop } from 'lucide-react'

// ---------------------------------------------------------------------------
// Theme Context & Hook
// ---------------------------------------------------------------------------
export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('workloadlens-theme')
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
    } catch {}
    return 'system'
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      if (theme === 'dark') return 'dark'
      if (theme === 'light') return 'light'
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'light'
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches)
      const resolved = isDark ? 'dark' : 'light'
      setResolvedTheme(resolved)

      const root = document.documentElement
      if (isDark) {
        root.classList.add('dark')
        root.setAttribute('data-theme', 'dark')
        root.style.colorScheme = 'dark'
      } else {
        root.classList.remove('dark')
        root.setAttribute('data-theme', 'light')
        root.style.colorScheme = 'light'
      }
    }

    applyTheme()

    const listener = () => {
      if (theme === 'system') applyTheme()
    }
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [theme])

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem('workloadlens-theme', newTheme)
    } catch {}
  }

  const toggleTheme = () => {
    // Cycle between Light -> Dark -> System
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, resolvedTheme, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`p-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none transition-colors cursor-pointer flex items-center justify-center ${className}`}
      title={`Theme: ${theme.toUpperCase()} (${resolvedTheme} active). Click to cycle Light → Dark → System`}
      aria-label={`Toggle theme (currently ${theme})`}
    >
      {theme === 'system' ? (
        <Laptop className="w-4 h-4 text-accent" />
      ) : resolvedTheme === 'dark' ? (
        <Moon className="w-4 h-4 text-indigo-400" />
      ) : (
        <Sun className="w-4 h-4 text-amber-500" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-surface border border-border text-text rounded-xl shadow-xs p-5 transition-all ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badge (success / warn / danger / info / default)
// ---------------------------------------------------------------------------
export type BadgeVariant = 'success' | 'warn' | 'danger' | 'info' | 'default'

export interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
  title?: string
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  className = '',
  title,
}) => {
  const styles: Record<BadgeVariant, string> = {
    success: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60',
    warn: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60',
    danger: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/60',
    info: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60',
    default: 'bg-surface-muted text-text-secondary border-border',
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Button (primary / secondary / ghost / danger, loading state)
// ---------------------------------------------------------------------------
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  children: ReactNode
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

  const variants = {
    primary:
      'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs hover:shadow-sm border border-transparent',
    secondary:
      'bg-surface hover:bg-surface-muted active:bg-surface-muted text-text border border-border shadow-xs',
    ghost:
      'bg-transparent hover:bg-surface-muted text-text-secondary hover:text-text border border-transparent',
    danger:
      'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs border border-transparent',
  }

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-xs px-3.5 py-2 gap-2',
    lg: 'text-sm px-4 py-2.5 gap-2.5',
  }

  return (
    <button
      disabled={disabled || isLoading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Stat
// ---------------------------------------------------------------------------
export interface StatProps {
  label: string
  value: string | number
  subtext?: string | ReactNode
  icon?: ReactNode
  className?: string
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  subtext,
  icon,
  className = '',
}) => {
  return (
    <Card className={`p-4 flex items-center justify-between ${className}`}>
      <div>
        <div className="text-xs font-medium text-muted tracking-wide uppercase">
          {label}
        </div>
        <div className="text-2xl font-bold text-text mt-1">{value}</div>
        {subtext && <div className="text-xs text-muted mt-0.5">{subtext}</div>}
      </div>
      {icon && <div className="text-accent opacity-90">{icon}</div>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Skeleton & Loaders
// ---------------------------------------------------------------------------
export interface SkeletonProps {
  className?: string
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return <div className={`animate-pulse bg-surface-muted rounded ${className}`} />
}

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <Card className={`space-y-3 ${className}`}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </Card>
  )
}

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({ rows = 4, cols = 5 }) => {
  return (
    <div className="space-y-3 p-4 bg-surface rounded-xl border border-border">
      <div className="flex gap-4 pb-2 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2 border-b border-border-subtle">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`text-center py-12 px-4 border border-dashed border-border rounded-xl bg-surface-muted/40 ${className}`}
    >
      {icon && (
        <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center mx-auto text-muted mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {description && (
        <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast (+ ToastProvider & useToast)
// ---------------------------------------------------------------------------
export interface ToastMessage {
  id: string
  title: string
  description?: string
  type: 'success' | 'error' | 'warn' | 'info'
}

interface ToastContextType {
  toast: (title: string, description?: string, type?: 'success' | 'error' | 'warn' | 'info') => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = (
    title: string,
    description?: string,
    type: 'success' | 'error' | 'warn' | 'info' = 'info'
  ) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, title, description, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3 rounded-lg shadow-md border text-xs flex items-start justify-between gap-2 transition-all ${
              t.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
                : t.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                : t.type === 'warn'
                ? 'bg-amber-50 dark:bg-amber-950/80 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                : 'bg-surface border-border text-text shadow-sm'
            }`}
          >
            <div>
              <div className="font-semibold">{t.title}</div>
              {t.description && <div className="text-muted mt-0.5">{t.description}</div>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-muted hover:text-text cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return { toast: (title: string) => console.log(title) }
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Modal / Drawer
// ---------------------------------------------------------------------------
export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}) => {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`bg-surface border border-border rounded-xl shadow-xl ${maxWidth} w-full p-5 space-y-4 text-text`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-text p-1 rounded-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export interface TabItem {
  id: string
  label: string
}

export interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
  className?: string
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
}) => {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`flex border-b border-border gap-4 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            id={`tab-${tab.id}`}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all -mb-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t cursor-pointer ${
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PageHeader (Breadcrumbs, Title, Subtitle, Actions)
// ---------------------------------------------------------------------------
export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface PageHeaderProps {
  title: string
  description?: string
  icon?: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
  className?: string
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon,
  breadcrumbs = [],
  actions,
  className = '',
}) => {
  return (
    <div className={`space-y-2 pb-4 border-b border-border ${className}`}>
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted">
          {breadcrumbs.map((b, idx) => {
            const isLast = idx === breadcrumbs.length - 1
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-muted/50">/</span>}
                {isLast || !b.href ? (
                  <span className={isLast ? 'font-semibold text-text' : ''}>
                    {b.label}
                  </span>
                ) : (
                  <a
                    href={b.href}
                    className="hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded px-1 -mx-1"
                  >
                    {b.label}
                  </a>
                )}
              </React.Fragment>
            )
          })}
        </nav>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text flex items-center gap-2.5">
            {icon && <span className="text-accent">{icon}</span>}
            {title}
          </h1>
          {description && (
            <p className="text-xs md:text-sm text-muted mt-1">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 self-start sm:self-auto">{actions}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WorkloadLensLogo (SVG Logo Mark matching favicon.svg)
// ---------------------------------------------------------------------------
export const WorkloadLensLogo: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 32,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`flex-shrink-0 ${className}`}
    aria-label="WorkloadLens logo mark"
  >
    <defs>
      <linearGradient id="lensGradUi" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="100%" stopColor="#312e81" />
      </linearGradient>
      <linearGradient id="lensCheckUi" x1="10" y1="14" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#c7d2fe" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8" fill="url(#lensGradUi)" />
    <path
      d="M16 6L8 9.5V15.5C8 21 11.5 26 16 27.5C20.5 26 24 21 24 15.5V9.5L16 6Z"
      stroke="#a5b4fc"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="rgba(255, 255, 255, 0.12)"
    />
    <path
      d="M12 16.5L14.8 19.5L20.5 13.5"
      stroke="url(#lensCheckUi)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
