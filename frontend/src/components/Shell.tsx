import React, { useState, useEffect, ReactNode, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Badge, ThemeToggle, useTheme, WorkloadLensLogo } from './ui'
import { checkHealth, DEMO } from '../lib/api'
import {
  Zap,
  History,
  Menu,
  X,
  UserCheck,
  Command,
  Search,
  Sparkles,
  Lock,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronDown,
} from 'lucide-react'

export const Shell: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, setToken, activeTokenOption, tokens, subscription } = useAuth()
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [identityPopoverOpen, setIdentityPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIdentityPopoverOpen(false)
      }
    }
    if (identityPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [identityPopoverOpen])

  // Live system health status from GET /health polling every 30s
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'offline' | 'checking'>('checking')

  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        const res = await checkHealth()
        if (mounted) {
          if (res && res.status === 'ok') {
            setHealthStatus('healthy')
          } else {
            setHealthStatus('offline')
          }
        }
      } catch {
        if (mounted) setHealthStatus('offline')
      }
    }

    check()
    const interval = setInterval(check, 30000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  // Keyboard shortcuts (Ctrl+K for palette, Escape to close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
        setPaletteQuery('')
        setSelectedIndex(0)
      } else if (e.key === 'Escape') {
        setCommandPaletteOpen(false)
        setIdentityPopoverOpen(false)
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Command Palette Items
  interface CommandItem {
    id: string
    title: string
    subtitle: string
    category: 'Navigation' | 'Demo Identity' | 'Fixtures & Scenarios' | 'Theme' | 'Help'
    icon: ReactNode
    action: () => void
    badge?: string
  }

  const commands: CommandItem[] = [
    // Navigation
    {
      id: 'nav-tools',
      title: 'Go to Run Tools',
      subtitle: 'Build job records, preview schema validations, and estimate workloads',
      category: 'Navigation',
      icon: <Zap className="w-4 h-4 text-[#C5A059]" />,
      action: () => navigate('/tools'),
    },
    {
      id: 'nav-history',
      title: 'Go to Workload History',
      subtitle: 'Inspect runs, replay idempotency keys, and view persisted results',
      category: 'Navigation',
      icon: <History className="w-4 h-4 text-[#C5A059]" />,
      action: () => navigate('/history'),
    },
    // Demo Identities
    ...tokens.map((t) => ({
      id: `identity-${t.token}`,
      title: `Switch to ${t.label}`,
      subtitle: `Tenant: ${t.tenant} | Role: ${t.role} | Plan: ${t.plan} | Status: ${t.status}`,
      category: 'Demo Identity' as const,
      icon: <UserCheck className="w-4 h-4 text-[#0F1E36] dark:text-[#C5A059]" />,
      action: () => setToken(t.token),
      badge: t.token === token ? 'Active' : undefined,
    })),
    // Fixtures & Scenarios
    {
      id: 'fixture-valid',
      title: 'Load Valid Fixture (2 compliant records)',
      subtitle: 'Populate builder with J01 (EXPORT: 20) and J02 (VALIDATE: 10)',
      category: 'Fixtures & Scenarios',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
      action: () => {
        if (location.pathname !== '/tools') navigate('/tools')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('workloadlens:load-fixture', { detail: 'valid' }))
        }, 50)
      },
    },
    {
      id: 'fixture-invalid',
      title: 'Load Invalid Fixture (Duplicate records & rule violations)',
      subtitle: 'Populate builder with records violating R1–R4 batch rules',
      category: 'Fixtures & Scenarios',
      icon: <AlertCircle className="w-4 h-4 text-amber-600" />,
      action: () => {
        if (location.pathname !== '/tools') navigate('/tools')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('workloadlens:load-fixture', { detail: 'invalid' }))
        }, 50)
      },
    },
    {
      id: 'fixture-clear',
      title: 'Clear Job Builder Records',
      subtitle: 'Reset builder table to empty state',
      category: 'Fixtures & Scenarios',
      icon: <FileText className="w-4 h-4 text-muted" />,
      action: () => {
        if (location.pathname !== '/tools') navigate('/tools')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('workloadlens:load-fixture', { detail: 'clear' }))
        }, 50)
      },
    },
    {
      id: 'open-demo-scenarios',
      title: 'Open Demo Scenarios Drawer',
      subtitle: 'Run interactive verification scenarios for UC-05 SaaS evaluation',
      category: 'Fixtures & Scenarios',
      icon: <Sparkles className="w-4 h-4 text-[#C5A059]" />,
      action: () => {
        if (location.pathname !== '/tools') navigate('/tools')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('workloadlens:open-scenarios'))
        }, 50)
      },
    },
    // Theme
    {
      id: 'theme-toggle',
      title: `Toggle Theme (Currently ${resolvedTheme})`,
      subtitle: 'Quickly switch between light and dark appearance',
      category: 'Theme',
      icon: resolvedTheme === 'dark' ? <Sun className="w-4 h-4 text-[#C5A059]" /> : <Moon className="w-4 h-4 text-[#0F1E36]" />,
      action: () => toggleTheme(),
    },
    {
      id: 'theme-light',
      title: 'Switch to Contemporary Light Theme',
      subtitle: 'Warm mist surfaces and deep navy architectural contrast',
      category: 'Theme',
      icon: <Sun className="w-4 h-4 text-[#C5A059]" />,
      action: () => setTheme('light'),
      badge: theme === 'light' ? 'Selected' : undefined,
    },
    {
      id: 'theme-dark',
      title: 'Switch to Contemporary Dark Theme',
      subtitle: 'Deep navy foundation with antique gold accents',
      category: 'Theme',
      icon: <Moon className="w-4 h-4 text-[#C5A059]" />,
      action: () => setTheme('dark'),
      badge: theme === 'dark' ? 'Selected' : undefined,
    },
    {
      id: 'theme-system',
      title: 'Use System Theme Preference',
      subtitle: 'Automatically follow your operating system appearance',
      category: 'Theme',
      icon: <Laptop className="w-4 h-4 text-muted" />,
      action: () => setTheme('system'),
      badge: theme === 'system' ? 'Selected' : undefined,
    },
  ]

  const filteredCommands = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(paletteQuery.toLowerCase()) ||
      c.subtitle.toLowerCase().includes(paletteQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(paletteQuery.toLowerCase())
  )

  const handlePaletteSelect = (item: CommandItem) => {
    setCommandPaletteOpen(false)
    item.action()
  }

  const paletteInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (commandPaletteOpen) {
      setTimeout(() => paletteInputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row text-text font-sans transition-colors duration-150">
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-[#0F1E36] text-white border-b border-[#1E2E4A] px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <WorkloadLensLogo size={28} />
          <div>
            <div className="font-serif font-semibold text-sm text-white tracking-tight leading-tight">WorkloadLens</div>
            <div className="text-[10px] text-[#C5A059] tracking-wider uppercase font-medium">Contemporary Heritage</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-white hover:text-[#C5A059] border-[#2A3E60]" />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded border border-[#2A3E60] text-gray-300 hover:text-white hover:bg-[#152642] cursor-pointer"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Left Sidebar: Strong Navy Foundation */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:flex flex-col w-full md:w-64 bg-[#0F1E36] text-white border-r border-[#1B2F4E] flex-shrink-0 z-30 md:sticky md:top-0 md:h-screen transition-colors duration-150`}
      >
        {/* Brand Header: Architectural Navy with Gold Accent */}
        <div className="p-5 border-b border-[#1B2F4E] hidden md:flex items-center gap-3">
          <WorkloadLensLogo size={34} />
          <div>
            <div className="font-serif font-medium text-base text-white tracking-tight leading-tight">
              WorkloadLens
            </div>
            <div className="text-[10px] text-[#C5A059] font-medium tracking-wider uppercase mt-0.5">
              Automation Workload SaaS
            </div>
          </div>
        </div>

        {/* Navigation Items (ONLY 2 items: Run Tools, History) */}
        <div className="p-4 flex-1">
          <div className="text-[10px] font-semibold text-[#8B9DB7] uppercase tracking-wider px-3 mb-2">
            Navigation
          </div>
          <nav className="space-y-1">
            <NavLink
              to="/tools"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-sm text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C5A059] ${
                  isActive
                    ? 'bg-[#182C4A] text-[#C5A059] font-semibold border-l-2 border-[#C5A059] shadow-2xs'
                    : 'text-gray-300 hover:text-white hover:bg-[#142640] border-l-2 border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Zap className={`w-4 h-4 ${isActive ? 'text-[#C5A059]' : 'text-[#8B9DB7]'}`} />
                  <span>Run Tools</span>
                </>
              )}
            </NavLink>
            <NavLink
              to="/history"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-sm text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C5A059] ${
                  isActive
                    ? 'bg-[#182C4A] text-[#C5A059] font-semibold border-l-2 border-[#C5A059] shadow-2xs'
                    : 'text-gray-300 hover:text-white hover:bg-[#142640] border-l-2 border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <History className={`w-4 h-4 ${isActive ? 'text-[#C5A059]' : 'text-[#8B9DB7]'}`} />
                  <span>History</span>
                </>
              )}
            </NavLink>
          </nav>

          {/* Heritage Architectural Accent Rule */}
          <div className="my-5 border-t border-[#1B2F4E] mx-2" />

          {/* Quick Context Summary */}
          <div className="px-3 py-2 text-[11px] text-[#8B9DB7] space-y-1.5 bg-[#0A1628]/60 rounded border border-[#1A2D4A]">
            <div className="flex items-center justify-between">
              <span className="text-[#6C82A2]">Tenant:</span>
              <span className="font-mono text-gray-200">{activeTokenOption.tenant}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6C82A2]">Role:</span>
              <span className="text-gray-200">{activeTokenOption.role}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6C82A2]">Plan:</span>
              <span className="text-[#C5A059] font-medium">{subscription?.plan || activeTokenOption.plan}</span>
            </div>
          </div>
        </div>

        {/* Command palette prompt trigger in sidebar footer */}
        <div className="px-4 py-3 border-t border-[#1B2F4E]">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-300 bg-[#142640] hover:bg-[#182C4A] rounded-sm border border-[#22395C] focus-visible:ring-1 focus-visible:ring-[#C5A059] focus-visible:outline-none transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>Palette</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-gray-300 bg-[#0F1E36] border border-[#22395C] rounded">
              Ctrl+K
            </kbd>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header: Clean Editorial Bar */}
        <header className="bg-surface border-b border-border px-5 py-3 sticky top-0 z-20 shadow-2xs transition-colors duration-150">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left: Active Identity Badges + Live Status Dot */}
            <div className="flex flex-wrap items-center gap-2">
              {/* System Live Status Dot from GET /health */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium border bg-surface-muted border-border cursor-default"
                title={
                  healthStatus === 'healthy'
                    ? 'GET /health 200 OK — API Live'
                    : 'System Status: Degraded or API unreachable'
                }
              >
                {healthStatus === 'healthy' ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                  </span>
                ) : (
                  <span className="inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                )}
                <span
                  className={
                    healthStatus === 'healthy'
                      ? 'text-emerald-800 dark:text-emerald-300 font-medium'
                      : 'text-rose-800 dark:text-rose-300 font-medium'
                  }
                >
                  {healthStatus === 'healthy' ? 'API Live' : 'API Offline'}
                </span>
              </div>

              {/* Tenant context */}
              <span className="text-xs font-medium text-text ml-1 tracking-tight">
                Tenant: <strong className="font-mono">{activeTokenOption.tenant}</strong>
              </span>

              <Badge variant="default" className="text-xs">
                {activeTokenOption.role}
              </Badge>

              {/* Plan Badge */}
              {(subscription?.plan || activeTokenOption.plan) === 'Pro' ? (
                <Badge variant="gold" className="gap-1 text-xs" title="Pro Plan: Validate + Process allowed, 10 daily quota">
                  <Sparkles className="w-3 h-3 text-[#C5A059]" />
                  Pro Plan
                </Badge>
              ) : (
                <Badge
                  variant="warn"
                  className="gap-1 text-xs"
                  title="Basic Plan: Validate only, 3 daily quota"
                >
                  <Lock className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                  Basic Plan
                </Badge>
              )}

              <Badge
                variant={(subscription?.status || activeTokenOption.status) === 'Active' ? 'success' : 'danger'}
                className="text-xs"
              >
                {subscription?.status || activeTokenOption.status}
              </Badge>
            </div>

            {/* Right: Quick actions + Theme Toggle + Identity Switcher */}
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
              {/* Command Palette Trigger */}
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary bg-surface hover:bg-surface-muted border border-border rounded-sm focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none transition-colors cursor-pointer"
                title="Open Command Palette (Ctrl+K)"
              >
                <Command className="w-3.5 h-3.5 text-[#C5A059]" />
                <span className="font-medium">Commands</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-muted border border-border rounded text-muted">
                  Ctrl+K
                </kbd>
              </button>

              {/* Theme Toggle (Light / Dark) */}
              <ThemeToggle />

              {/* DEMO-only Demo Identities Panel Popover */}
              {DEMO && (
                <div className="relative" ref={popoverRef}>
                  <button
                    type="button"
                    aria-expanded={identityPopoverOpen}
                    aria-haspopup="dialog"
                    aria-label="Demo identities switcher"
                    onClick={() => setIdentityPopoverOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-surface-muted border border-border text-text text-xs rounded-sm font-medium shadow-2xs focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none transition-colors cursor-pointer"
                    title="Switch evaluation identity"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span className="hidden sm:inline font-medium">
                      {activeTokenOption.label}
                    </span>
                    <span className="sm:hidden font-medium">
                      {activeTokenOption.role}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-muted transition-transform duration-150 ${
                        identityPopoverOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {identityPopoverOpen && (
                    <div
                      role="dialog"
                      aria-label="Demo identities switcher"
                      className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-md border border-border bg-surface p-3 shadow-lg z-50 space-y-2 animate-in fade-in zoom-in-95"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-border">
                        <div className="text-xs font-semibold text-text flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-[#C5A059]" />
                          <span>Evaluation Identities</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted bg-surface-muted px-1.5 py-0.5 rounded-sm">
                          Bearer Auth
                        </span>
                      </div>

                      <div className="space-y-1.5 max-h-80 overflow-y-auto">
                        {tokens.map((t) => {
                          const isActive = t.token === token
                          return (
                            <button
                              key={t.token}
                              type="button"
                              onClick={() => {
                                setToken(t.token)
                                setIdentityPopoverOpen(false)
                              }}
                              className={`w-full text-left p-2.5 rounded-sm border transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-[#0F1E36]/8 dark:bg-[#C5A059]/15 border-[#0F1E36] dark:border-[#C5A059] text-text font-medium'
                                  : 'bg-surface-muted/30 border-border hover:bg-surface-muted text-text-secondary hover:text-text'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium text-text flex items-center gap-1.5">
                                  <span>{t.label}</span>
                                  {isActive && (
                                    <span className="text-[9px] font-semibold text-[#8C6D2D] dark:text-[#E2C37E] uppercase tracking-wider bg-[#C5A059]/20 px-1 py-0.2 rounded-xs">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <Badge
                                  variant={t.status === 'Active' ? 'success' : 'danger'}
                                  className="text-[10px] px-1 py-0"
                                >
                                  {t.status}
                                </Badge>
                              </div>
                              <div className="text-[11px] text-muted mt-1 flex items-center gap-1.5 flex-wrap font-mono">
                                <span>{t.tenant}</span>
                                <span>&bull;</span>
                                <span>{t.role}</span>
                                <span>&bull;</span>
                                <span>{t.plan}</span>
                              </div>
                            </button>
                          )
                        })}
                      </div>

                      <div className="pt-2 border-t border-border text-[10px] text-muted flex items-center justify-between">
                        <span>Tenant from verified token only</span>
                        <kbd className="px-1 py-0.5 font-mono text-[9px] bg-surface-muted rounded border border-border">
                          No tenant header
                        </kbd>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-5 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* COMMAND PALETTE MODAL (Ctrl+K)                                      */}
      {/* ------------------------------------------------------------------- */}
      {commandPaletteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24 bg-[#0F1E36]/70 backdrop-blur-2xs"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <div
            className="bg-surface border border-border rounded-md shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="p-3.5 border-b border-border flex items-center gap-3">
              <Search className="w-4 h-4 text-muted" />
              <input
                ref={paletteInputRef}
                type="text"
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % (filteredCommands.length || 1))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    if (filteredCommands[selectedIndex]) {
                      handlePaletteSelect(filteredCommands[selectedIndex])
                    }
                  } else if (e.key === 'Escape') {
                    setCommandPaletteOpen(false)
                  }
                }}
                placeholder="Type a command or search (e.g. tools, theme, fixture, tenant)..."
                className="flex-1 bg-transparent text-sm text-text placeholder-muted focus:outline-none"
              />
              <kbd className="px-2 py-0.5 text-[10px] font-mono text-muted bg-surface-muted border border-border rounded">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <div className="overflow-y-auto p-2 divide-y divide-border/60 space-y-1">
              {filteredCommands.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted">
                  No commands matching "{paletteQuery}"
                </div>
              ) : (
                filteredCommands.map((item, idx) => {
                  const isSelected = idx === selectedIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePaletteSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full text-left p-2.5 rounded-sm flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#0F1E36]/8 dark:bg-[#C5A059]/15 text-text'
                          : 'hover:bg-surface-muted text-text-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-sm bg-surface border border-border shadow-2xs flex-shrink-0">
                          {item.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                            {item.title}
                            {item.badge && (
                              <span className="text-[10px] font-normal px-1.5 py-0.2 rounded-xs bg-[#C5A059]/20 text-[#8C6D2D] dark:text-[#E2C37E]">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-mono text-muted tracking-wider flex-shrink-0">
                        {item.category}
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            {/* Palette Footer */}
            <div className="p-2.5 border-t border-border bg-surface-muted/50 flex items-center justify-between text-[11px] text-muted">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>ESC Close</span>
              </div>
              <span className="font-serif">WorkloadLens Contemporary Heritage</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
