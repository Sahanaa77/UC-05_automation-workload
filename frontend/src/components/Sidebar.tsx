import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ShieldCheck,
  LayoutDashboard,
  FileCode,
  Cpu,
  Compass,
  BarChart3,
  Info,
  Layers,
  History,
} from 'lucide-react'
import { cn } from '../lib/utils'

interface SidebarProps {
  onOpenBoundaries: () => void
  isMobileOpen?: boolean
  onCloseMobile?: () => void
}

interface NavItem {
  title: string
  path: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  // Official UC-05 SaaS Screens
  { title: 'Run Tools', path: '/tools', icon: Layers, badge: 'UC-05' },
  { title: 'History', path: '/history', icon: History },

  // Preserved Workbench Screens
  { title: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { title: 'Models', path: '/models', icon: FileCode },
  { title: 'Simulator', path: '/simulator', icon: Cpu, badge: 'Sandbox' },
  { title: 'Verification', path: '/verification', icon: Compass },
  { title: 'Reports', path: '/reports', icon: BarChart3 },
]

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenBoundaries,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const location = useLocation()

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-border flex flex-col transition-transform duration-200 lg:static lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo Section */}
        <div className="h-16 px-5 border-b border-border flex items-center justify-between shrink-0">
          <NavLink to="/tools" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-text text-lg tracking-tight">WorkloadLens</span>
                <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-primary/20 text-primary border border-primary/30 rounded uppercase tracking-wider">
                  UC-05
                </span>
              </div>
              <p className="text-[10px] text-muted">Automation Workload Preview</p>
            </div>
          </NavLink>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Workload Preview
          </div>

          {NAV_ITEMS.slice(0, 2).map((item) => {
            const Icon = item.icon
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer group',
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/30 shadow-xs'
                    : 'text-muted hover:text-text hover:bg-elevated border border-transparent'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      'w-4 h-4 transition-colors',
                      isActive ? 'text-primary' : 'text-muted group-hover:text-text'
                    )}
                  />
                  <span>{item.title}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-primary/10 text-primary border border-primary/20">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}

          <div className="px-3 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Model Verification
          </div>

          {NAV_ITEMS.slice(2).map((item) => {
            const Icon = item.icon
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer group',
                  isActive
                    ? 'bg-primary/15 text-primary border border-primary/30 shadow-xs'
                    : 'text-muted hover:text-text hover:bg-elevated border border-transparent'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      'w-4 h-4 transition-colors',
                      isActive ? 'text-primary' : 'text-muted group-hover:text-text'
                    )}
                  />
                  <span>{item.title}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-primary/10 text-primary border border-primary/20">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </div>

        {/* Footer info button */}
        <div className="p-3 border-t border-border">
          <button
            onClick={onOpenBoundaries}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-muted hover:text-text bg-elevated/50 hover:bg-elevated rounded-lg border border-border transition-colors cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>UC-05 Rules &amp; Boundaries</span>
          </button>
        </div>
      </aside>
    </>
  )
}
export default Sidebar
