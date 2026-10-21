import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { BoundariesDialog } from './components/BoundariesDialog'
import { RunHistoryDrawer } from './components/RunHistoryDrawer'
import { DemoController } from './components/DemoController'
import { ToastContainer } from './components/ToastContainer'
import { Dashboard } from './pages/Dashboard'
import { ModelDefine } from './pages/ModelDefine'
import { Simulator } from './pages/Simulator'
import { Verification } from './pages/Verification'
import { Reports } from './pages/Reports'
import { BoundedExploration } from './pages/BoundedExploration'
import { ViolationMinimization } from './pages/ViolationMinimization'
import { InspectStateDiff } from './pages/InspectStateDiff'
import { FixRetest } from './pages/FixRetest'
import { RegressionExport } from './pages/RegressionExport'
import { RunTools } from './pages/RunTools'
import { WorkloadHistory } from './pages/WorkloadHistory'

export const AppContent: React.FC = () => {
  const [isBoundariesOpen, setIsBoundariesOpen] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const location = useLocation()
  const { toasts, dismissToast } = useApp()

  useEffect(() => {
    const path = location.pathname
    let title = 'WorkloadLens — Automation Workload Preview SaaS (UC-05)'
    if (path.startsWith('/tools')) title = 'Run Tools — WorkloadLens'
    else if (path.startsWith('/history')) title = 'Execution History — WorkloadLens'
    else if (path.startsWith('/dashboard')) title = 'Dashboard — WorkloadLens'
    else if (path.startsWith('/models')) title = 'Model Builder — WorkloadLens'
    else if (path.startsWith('/simulator')) title = 'Event Simulator — WorkloadLens'
    else if (path.startsWith('/verification')) title = 'Verification — WorkloadLens'
    else if (path.startsWith('/reports')) title = 'Reports & Runs — WorkloadLens'
    document.title = title
  }, [location.pathname])

  return (
    <div className="min-h-screen flex bg-bg text-text">
      {/* Left Sidebar */}
      <Sidebar
        onOpenBoundaries={() => setIsBoundariesOpen(true)}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Bar */}
        <TopBar onToggleMobileMenu={() => setIsMobileNavOpen((prev) => !prev)} />

        {/* Dynamic Route View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Routes>
            {/* UC-05 Standard Screens */}
            <Route path="/tools" element={<RunTools />} />
            <Route path="/history" element={<WorkloadHistory />} />

            {/* Preserved Model Exploration Workbench Screens */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/models" element={<ModelDefine />} />
            <Route path="/simulator" element={<Simulator />} />

            {/* Verification 6-step flow nested under /verification/* */}
            <Route path="/verification" element={<Verification />}>
              <Route index element={<Navigate to="/verification/model" replace />} />
              <Route path="model" element={<ModelDefine />} />
              <Route path="explore" element={<BoundedExploration />} />
              <Route path="minimize" element={<ViolationMinimization />} />
              <Route path="diff" element={<InspectStateDiff />} />
              <Route path="fix" element={<FixRetest />} />
              <Route path="export" element={<RegressionExport />} />
            </Route>

            <Route path="/reports" element={<Reports />} />

            {/* Backward-compatible route aliases */}
            <Route path="/explore" element={<Navigate to="/verification/explore" replace />} />
            <Route path="/minimize" element={<Navigate to="/verification/minimize" replace />} />
            <Route path="/diff" element={<Navigate to="/verification/diff" replace />} />
            <Route path="/fix" element={<Navigate to="/verification/fix" replace />} />
            <Route path="/export" element={<Navigate to="/verification/export" replace />} />

            {/* Default root navigation points to WorkloadLens Run Tools */}
            <Route path="/" element={<Navigate to="/tools" replace />} />
            <Route path="*" element={<Navigate to="/tools" replace />} />
          </Routes>
        </main>

        <footer className="border-t border-border bg-surface py-3 text-xs text-muted">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              <span>WorkloadLens &copy; 2026 &middot; Automation Workload Preview SaaS (UC-05)</span>
            </div>
            <div>
              <button
                onClick={() => setIsBoundariesOpen(true)}
                className="hover:text-primary transition-colors underline-offset-2 hover:underline cursor-pointer"
              >
                Project Boundaries &amp; Verification Rules
              </button>
            </div>
          </div>
        </footer>
      </div>

      <BoundariesDialog isOpen={isBoundariesOpen} onClose={() => setIsBoundariesOpen(false)} />
      <RunHistoryDrawer />
      <DemoController onOpenBoundaries={() => setIsBoundariesOpen(true)} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </BrowserRouter>
  )
}
export default App
