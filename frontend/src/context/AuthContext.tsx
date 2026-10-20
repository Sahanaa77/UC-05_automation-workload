import React, { createContext, useContext, useState, ReactNode } from 'react'

export interface DevTokenOption {
  token: string
  label: string
  tenant: string
  role: string
  plan: string
  status: string
}

export const DEV_TOKENS: DevTokenOption[] = [
  {
    token: 'dev-token-a-operator',
    label: 'Tenant A Operator (Pro - Active)',
    tenant: 'Tenant A',
    role: 'Operator',
    plan: 'Pro',
    status: 'Active',
  },
  {
    token: 'dev-token-a-viewer',
    label: 'Tenant A Viewer (Pro - Read-only)',
    tenant: 'Tenant A',
    role: 'Viewer',
    plan: 'Pro',
    status: 'Active',
  },
  {
    token: 'dev-token-b-operator',
    label: 'Tenant B Operator (Basic - Active)',
    tenant: 'Tenant B',
    role: 'Operator',
    plan: 'Basic',
    status: 'Active',
  },
  {
    token: 'suspended_operator',
    label: 'Tenant Suspended (Pro - Suspended)',
    tenant: 'Tenant Suspended',
    role: 'Operator',
    plan: 'Pro',
    status: 'Suspended',
  },
]

interface AuthContextType {
  token: string
  setToken: (token: string) => void
  activeTokenOption: DevTokenOption
  tokens: DevTokenOption[]
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string>('dev-token-a-operator')

  const activeTokenOption =
    DEV_TOKENS.find((t) => t.token === token) || DEV_TOKENS[0]

  return (
    <AuthContext.Provider
      value={{
        token,
        setToken,
        activeTokenOption,
        tokens: DEV_TOKENS,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
