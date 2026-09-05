import { LoaderCircle } from "lucide-react"
import { Navigate, Outlet, useLocation } from "react-router-dom"

import { useAuth } from "@/features/auth/AuthContext"

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoaderCircle
          className="size-8 animate-spin text-muted-foreground"
          aria-label="Loading session"
        />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
