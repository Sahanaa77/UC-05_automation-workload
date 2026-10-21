import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { getSubscription, getTools, setApiToken, getApiToken, ToolsApiResponse } from '../lib/api'
import { UC05Subscription } from '../types'

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
    token: 'token-tenant-a-operator',
    label: 'Tenant A Operator (Pro - Active)',
    tenant: 'Tenant A',
    role: 'Operator',
    plan: 'Pro',
    status: 'Active',
  },
  {
    token: 'token-tenant-a-viewer',
    label: 'Tenant A Viewer (Pro - Read-only)',
    tenant: 'Tenant A',
    role: 'Viewer',
    plan: 'Pro',
    status: 'Active',
  },
  {
    token: 'token-tenant-b-operator',
    label: 'Tenant B Operator (Basic - Active)',
    tenant: 'Tenant B',
    role: 'Operator',
    plan: 'Basic',
    status: 'Active',
  },
  {
    token: 'token-tenant-b-viewer',
    label: 'Tenant B Viewer (Basic - Read-only)',
    tenant: 'Tenant B',
    role: 'Viewer',
    plan: 'Basic',
    status: 'Active',
  },
  {
    token: 'token-tenant-suspended-operator',
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
  subscription: UC05Subscription | null
  toolsData: ToolsApiResponse | null
  isAuthLoading: boolean
  refetchAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string>(() => getApiToken())
  const [subscription, setSubscription] = useState<UC05Subscription | null>(null)
  const [toolsData, setToolsData] = useState<ToolsApiResponse | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true)

  const activeTokenOption =
    DEV_TOKENS.find((t) => t.token === token) ||
    DEV_TOKENS.find((t) => t.token.includes(token.replace('dev-', ''))) ||
    DEV_TOKENS[0]

  const fetchAuthData = useCallback(async (authToken: string) => {
    setIsAuthLoading(true)
    setSubscription(null)
    setToolsData(null)
    try {
      const [sub, tools] = await Promise.all([
        getSubscription(authToken),
        getTools(authToken),
      ])
      setSubscription(sub)
      setToolsData(tools)
    } catch (err) {
      console.error('Failed to fetch auth/subscription data for', authToken, err)
    } finally {
      setIsAuthLoading(false)
    }
  }, [])

  const setToken = useCallback((newToken: string) => {
    setTokenState(newToken)
    setApiToken(newToken)
    setSubscription(null)
    setToolsData(null)
    setIsAuthLoading(true)
    window.dispatchEvent(new CustomEvent('workloadlens:identity-changed', { detail: newToken }))
    fetchAuthData(newToken)
  }, [fetchAuthData])

  useEffect(() => {
    fetchAuthData(token)
  }, [fetchAuthData, token])

  const refetchAuth = useCallback(async () => {
    await fetchAuthData(token)
  }, [fetchAuthData, token])

  return (
    <AuthContext.Provider
      value={{
        token,
        setToken,
        activeTokenOption,
        tokens: DEV_TOKENS,
        subscription,
        toolsData,
        isAuthLoading,
        refetchAuth,
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
