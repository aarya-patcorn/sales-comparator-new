import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth, type AdminUser } from "@/features/auth/AuthContext"
import { apiPost } from "@/lib/apiClient"
import { env } from "@/lib/env"

type LoginResponse = {
  token: string
  user: AdminUser
}

export function LoginPage() {
  const navigate = useNavigate()
  const { setSession } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)

  async function finishGoogleLogin(idToken: string) {
    setIsSigningIn(true)

    try {
      // Google proves identity; the backend decides whether that identity is an allowed admin.
      const response = await apiPost<LoginResponse>(
        "/api/admin/auth/google",
        { idToken },
      )
      setSession(response.token, response.user)
      navigate("/dashboard", { replace: true })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sign in"
      toast.error("Admin sign-in failed", { description: message })
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sales Comparator Admin</CardTitle>
          <CardDescription>
            Sign in with an authorized Google account to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {isSigningIn ? (
            <div className="w-full max-w-80 space-y-2 text-center">
              <Skeleton className="h-10 w-full" />
              <p className="text-sm text-muted-foreground">Signing you in…</p>
            </div>
          ) : (
            <GoogleOAuthProvider clientId={env.googleClientId}>
              <GoogleLogin
                onSuccess={(credentialResponse) => {
                  if (!credentialResponse.credential) {
                    toast.error("Google did not return a valid ID token")
                    return
                  }

                  void finishGoogleLogin(credentialResponse.credential)
                }}
                onError={() => {
                  toast.error("Google sign-in could not be completed")
                }}
                text="signin_with"
                shape="rectangular"
                size="large"
                width="320"
              />
            </GoogleOAuthProvider>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
