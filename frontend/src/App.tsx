import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RunTools } from './pages/RunTools'
import { WorkloadHistory } from './pages/WorkloadHistory'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider, ThemeProvider } from './components/ui'
import { Shell } from './components/Shell'

export const AppContent: React.FC = () => {
  return (
    <Shell>
      <Routes>
        <Route path="/tools" element={<RunTools />} />
        <Route path="/history" element={<WorkloadHistory />} />
        <Route path="/" element={<Navigate to="/tools" replace />} />
        <Route path="*" element={<Navigate to="/tools" replace />} />
      </Routes>
    </Shell>
  )
}

export const App: React.FC = () => {
  return (
    <HashRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </HashRouter>
  )
}

export default App
