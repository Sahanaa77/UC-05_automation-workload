import React, { useState, useEffect, ErrorInfo, ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RunTools } from './pages/RunTools'
import { WorkloadHistory } from './pages/WorkloadHistory'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider, ThemeProvider, Button } from './components/ui'
import { Shell } from './components/Shell'
import { AlertTriangle, RotateCcw, WifiOff } from 'lucide-react'

// Offline Status Strip
export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      role="alert"
      className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 border-b border-amber-600 shadow-xs z-50 sticky top-0"
    >
      <WifiOff className="w-4 h-4 text-slate-950" />
      <span>You are currently offline. Workload submissions and server sync will fail until reconnected.</span>
    </div>
  )
}

// Error Boundary with Retry
interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('WorkloadLens ErrorBoundary caught an unhandled rendering error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-text flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-danger/10 text-danger flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-text">Something went wrong</h2>
            <p className="text-xs text-muted">
              {this.state.error?.message || 'An unexpected rendering error occurred in the application.'}
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="primary" size="sm" onClick={this.handleRetry}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Try again
              </Button>
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                Reload application
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export const AppContent: React.FC = () => {
  return (
    <>
      <OfflineBanner />
      <Shell>
        <Routes>
          <Route path="/tools" element={<RunTools />} />
          <Route path="/history" element={<WorkloadHistory />} />
          <Route path="/" element={<Navigate to="/tools" replace />} />
          <Route path="*" element={<Navigate to="/tools" replace />} />
        </Routes>
      </Shell>
    </>
  )
}

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <AppContent />
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App
