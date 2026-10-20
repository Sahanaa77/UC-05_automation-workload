import React, { useState, useEffect, ReactNode, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Badge, Modal, Button, ThemeToggle, useTheme } from './ui'
import { checkHealth } from '../lib/api'
import {
  Layers,
  Zap,
  History,
  Menu,
  X,
  UserCheck,
  Shield,
  HelpCircle,
  Command,
  Search,
  Sparkles,
  Lock,
  ArrowRight,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sliders,
} from 'lucide-react'

export const Shell: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token, setToken, activeTokenOption, tokens } = useAuth()
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)

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

  // Onboarding "How it works" modal on first visit
  useEffect(() => {
    try {
      const hasSeen = localStorage.getItem('workloadlens-onboarding-seen')
      if (!hasSeen) {
        setHowItWorksOpen(true)
      }
    } catch {}
  }, [])

  const closeHowItWorks = () => {
    setHowItWorksOpen(false)
    try {
      localStorage.setItem('workloadlens-onboarding-seen', 'true')
    } catch {}
  }

  // Command palette keyboard shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
        setPaletteQuery('')
        setSelectedIndex(0)
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
      icon: <Zap className="w-4 h-4 text-indigo-500" />,
      action: () => navigate('/tools'),
    },
    {
      id: 'nav-history',
      title: 'Go to Workload History',
      subtitle: 'Inspect runs, replay idempotency keys, and view blob results',
      category: 'Navigation',
      icon: <History className="w-4 h-4 text-indigo-500" />,
      action: () => navigate('/history'),
    },
    // Demo Identities
    ...tokens.map((t) => ({
      id: `identity-${t.token}`,
      title: `Switch to ${t.label}`,
      subtitle: `Tenant: ${t.tenant} | Role: ${t.role} | Plan: ${t.plan} | Status: ${t.status}`,
      category: 'Demo Identity' as const,
      icon: <UserCheck className="w-4 h-4 text-indigo-500" />,
      action: () => setToken(t.token),
      badge: t.token === token ? 'Active' : undefined,
    })),
    // Fixtures & Scenarios
    {
      id: 'fixture-valid',
      title: 'Load Valid Fixture (2 compliant records)',
      subtitle: 'Populate builder with J01 (EXPORT: 20) and J02 (VALIDATE: 10)',
      category: 'Fixtures & Scenarios',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      action: () => {
        if (location.pathname !== '/tools') navigate('/tools')
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('workloadlens:load-fixture', { detail: 'valid' }))
        }, 50)
      },
    },
    {
      id: 'fixture-invalid',
      title: 'Load Invalid Fixture (Duplicate records)',
      subtitle: 'Populate builder with duplicate J01 record to test validator warnings',
      category: 'Fixtures & Scenarios',
      icon: <AlertCircle className="w-4 h-4 text-amber-500" />,
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
      icon: <FileText className="w-4 h-4 text-slate-400" />,
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
      icon: <Sparkles className="w-4 h-4 text-indigo-500" />,
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
      subtitle: 'Quickly switch between light and dark themes',
      category: 'Theme',
      icon: resolvedTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />,
      action: () => toggleTheme(),
    },
    {
      id: 'theme-light',
      title: 'Switch to Light Theme',
      subtitle: 'Clean, high-contrast light mode tailored for productivity',
      category: 'Theme',
      icon: <Sun className="w-4 h-4 text-amber-500" />,
      action: () => setTheme('light'),
      badge: theme === 'light' ? 'Selected' : undefined,
    },
    {
      id: 'theme-dark',
      title: 'Switch to Dark Theme',
      subtitle: 'Sleek, low-glare dark mode using modern CSS variables',
      category: 'Theme',
      icon: <Moon className="w-4 h-4 text-indigo-400" />,
      action: () => setTheme('dark'),
      badge: theme === 'dark' ? 'Selected' : undefined,
    },
    {
      id: 'theme-system',
      title: 'Use System Theme Preference',
      subtitle: 'Automatically follow your operating system appearance',
      category: 'Theme',
      icon: <Laptop className="w-4 h-4 text-slate-500" />,
      action: () => setTheme('system'),
      badge: theme === 'system' ? 'Selected' : undefined,
    },
    // Help
    {
      id: 'help-how-it-works',
      title: 'How It Works Guide',
      subtitle: 'Open the 3-step automation preview orientation walkthrough',
      category: 'Help',
      icon: <HelpCircle className="w-4 h-4 text-indigo-500" />,
      action: () => setHowItWorksOpen(true),
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">WorkloadLens</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Automation workload preview</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Left Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:flex flex-col w-full md:w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 z-30 md:sticky md:top-0 md:h-screen transition-colors duration-200`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 hidden md:flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-600/30">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-base text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
              WorkloadLens
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Automation workload preview
            </div>
          </div>
        </div>

        {/* Navigation Items (ONLY 2 items: Run Tools, History) */}
        <div className="p-4 flex-1">
          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 mb-2">
            Navigation
          </div>
          <nav className="space-y-1">
            <NavLink
              to="/tools"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-100 dark:border-indigo-900 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                }`
              }
            >
              <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Run Tools
            </NavLink>
            <NavLink
              to="/history"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-100 dark:border-indigo-900 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                }`
              }
            >
              <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              History
            </NavLink>
          </nav>
        </div>

        {/* Command palette prompt trigger in sidebar */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              Command Palette
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-2xs">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Sidebar Footer info */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-indigo-500" />
          <span>Tenant Isolated Environment</span>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200/90 dark:border-slate-800 px-5 py-3 sticky top-0 z-20 shadow-2xs transition-colors duration-200">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left: Active Identity Badges + Live Status Dot */}
            <div className="flex flex-wrap items-center gap-2">
              {/* System Live Status Dot from GET /health */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80"
                title={
                  healthStatus === 'healthy'
                    ? 'System Status: Operational (GET /health polling every 30s)'
                    : 'System Status: Degraded or API unreachable'
                }
              >
                {healthStatus === 'healthy' ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                ) : (
                  <span className="inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                )}
                <span
                  className={
                    healthStatus === 'healthy'
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-rose-700 dark:text-rose-400 font-semibold'
                  }
                >
                  {healthStatus === 'healthy' ? 'API Live' : 'API Offline'}
                </span>
              </div>

              {/* Tenant context badges */}
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 ml-1">
                {activeTokenOption.tenant}
              </span>

              <Badge variant="default">{activeTokenOption.role}</Badge>

              {/* Plan Badge with Pro-feature Lock Icons */}
              {activeTokenOption.plan === 'Pro' ? (
                <Badge variant="info" className="gap-1" title="Pro Plan: Full processing enabled & 10 daily quota">
                  <Sparkles className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                  Pro Plan
                </Badge>
              ) : (
                <Badge
                  variant="default"
                  className="gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
                  title="Basic Plan: Processing locked (validate only) & 3 daily quota"
                >
                  <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  Basic Plan (Pro Locked)
                </Badge>
              )}

              <Badge variant={activeTokenOption.status === 'Active' ? 'success' : 'danger'}>
                {activeTokenOption.status}
              </Badge>
            </div>

            {/* Right: Quick actions + Theme Toggle + Help "?" + Identity Switcher */}
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
              {/* Command Palette Trigger */}
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-lg focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none transition-colors cursor-pointer"
                title="Open Command Palette (Ctrl+K)"
              >
                <Command className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[11px] font-medium">Commands</span>
                <kbd className="px-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-500 dark:text-slate-400">
                  Ctrl+K
                </kbd>
              </button>

              {/* Theme Toggle (Light / Dark) */}
              <ThemeToggle />

              {/* "?" Help Button */}
              <button
                type="button"
                onClick={() => setHowItWorksOpen(true)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none transition-colors cursor-pointer"
                title="How it works guide"
                aria-label="How it works guide"
              >
                <HelpCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </button>

              {/* Dev-only Demo Identity Switcher */}
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="demo-identity-select"
                  className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 whitespace-nowrap"
                >
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="hidden sm:inline">Demo identity:</span>
                </label>
                <select
                  id="demo-identity-select"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs rounded-lg px-2 py-1.5 font-medium focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none transition-all cursor-pointer"
                  title="Switch dev authentication token (never sends a tenant field)"
                >
                  {tokens.map((t) => (
                    <option key={t.token} value={t.token}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-5 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* "HOW IT WORKS" MODAL (First visit + "?" button)                    */}
      {/* ------------------------------------------------------------------- */}
      <Modal
        isOpen={howItWorksOpen}
        onClose={closeHowItWorks}
        title="How WorkloadLens Works"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Welcome to <strong className="font-semibold text-indigo-600 dark:text-indigo-400">WorkloadLens</strong>. This preview SaaS platform lets automation operators simulate, test, and estimate scheduled workload runs with tenant isolation and quota enforcement.
          </p>

          <div className="space-y-3.5 pt-1">
            {/* Step 1 */}
            <div className="flex gap-3 items-start p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Build Job Batches
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Define 1 to 10 automated job records specifying Tool (EXPORT/VALIDATE), Record count, and Environment. You can also load standard verification fixtures with one click.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3 items-start p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Validate & Process
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Run validation previews (Basic or Pro) or full workload processing (exclusive to Pro plan). Each submission uses an Idempotency-Key header to prevent duplicate execution or quota over-debiting.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3 items-start p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Review History & Telemetry
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Inspect immutable run execution logs, SHA-256 payload fingerprints, cloud blob results, daily usage quotas, and automated advisor recommendations for run optimization.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <Button variant="primary" size="sm" onClick={closeHowItWorks} className="gap-1.5">
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------------------------- */}
      {/* COMMAND PALETTE MODAL (Ctrl+K)                                      */}
      {/* ------------------------------------------------------------------- */}
      {commandPaletteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500" />
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
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
              />
              <kbd className="px-2 py-0.5 text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <div className="overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60 space-y-1">
              {filteredCommands.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
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
                      className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-slate-900 dark:text-slate-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs flex-shrink-0">
                          {item.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                            {item.title}
                            {item.badge && (
                              <span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider flex-shrink-0">
                        {item.category}
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            {/* Palette Footer */}
            <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>ESC Close</span>
              </div>
              <span>WorkloadLens Commands</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
