import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "react-router-dom"

import { apiGet, apiPost } from "@/lib/apiClient"
import {
  clearAdminToken,
  getAdminToken,
  saveAdminToken,
} from "@/lib/authStorage"

export type AdminUser = {
  id: string
  name: string | null
  role: string
  email: string | null
  avatarUrl: string | null
}

type AuthContextValue = {
  user: AdminUser | null
  isLoading: boolean
  setSession: (token: string, user: AdminUser) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<AdminUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true

    async function restoreSession() {
      // A saved app token is verified with the backend before trusting it.
      if (!getAdminToken()) {
        setIsLoading(false)
        return
      }

      try {
        const response = await apiGet<{ user: AdminUser }>(
          "/api/admin/auth/me",
        )
        if (isCurrent) setUser(response.user)
      } catch {
        clearAdminToken()
        if (isCurrent) setUser(null)
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    void restoreSession()

    return () => {
      isCurrent = false
    }
  }, [])

  const setSession = useCallback((token: string, nextUser: AdminUser) => {
    // Login stores the token once; later API calls retrieve it automatically.
    saveAdminToken(token)
    setUser(nextUser)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiPost<void>("/api/admin/auth/logout")
    } catch {
      // Local logout still succeeds if the session already expired or the API is down.
    } finally {
      clearAdminToken()
      setUser(null)
      navigate("/login", { replace: true })
    }
  }, [navigate])

  const value = useMemo(
    () => ({ user, isLoading, setSession, logout }),
    [isLoading, logout, setSession, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider")
  }

  return context
}
