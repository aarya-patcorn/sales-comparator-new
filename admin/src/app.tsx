import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { LoaderCircle } from "lucide-react"
import { lazy, Suspense, useEffect } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { AppLayout } from "@/components/AppLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/features/auth/AuthContext"
import { DashboardPage } from "@/pages/DashboardPage"
import { LoginPage } from "@/pages/LoginPage"
import { NotFoundPage } from "@/pages/not-found-page"

const RmUsersPage = lazy(() =>
  import("@/pages/RmUsersPage").then((module) => ({
    default: module.RmUsersPage,
  })),
)

const ProductsPage = lazy(() =>
  import("@/pages/ProductsPage").then((module) => ({
    default: module.ProductsPage,
  })),
)

const CompetitorsPage = lazy(() =>
  import("@/pages/CompetitorsPage").then((module) => ({
    default: module.CompetitorsPage,
  })),
)

const AdminsPage = lazy(() =>
  import("@/pages/AdminsPage").then((module) => ({
    default: module.AdminsPage,
  })),
)

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/rm-users": "RM Users",
  "/products": "Products",
  "/competitors": "Competitors",
  "/admins": "Admin allow-list",
  "/login": "Sign in",
}

function RouteTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = `${pageTitles[pathname] ?? "Admin"} · Sales Comparator`
  }, [pathname])

  return null
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-64 items-center justify-center">
          <LoaderCircle className="size-7 animate-spin text-muted-foreground" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RouteTitle />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route
                  path="rm-users"
                  element={
                    <LazyPage>
                      <RmUsersPage />
                    </LazyPage>
                  }
                />
                <Route path="products" element={<LazyPage><ProductsPage /></LazyPage>} />
                <Route
                  path="competitors"
                  element={
                    <LazyPage>
                      <CompetitorsPage />
                    </LazyPage>
                  }
                />
                <Route
                  path="admins"
                  element={
                    <LazyPage>
                      <AdminsPage />
                    </LazyPage>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
