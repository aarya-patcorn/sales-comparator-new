import {
  Boxes,
  Gauge,
  LogOut,
  PackageSearch,
  ShieldCheck,
  Users,
} from "lucide-react"
import { useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useAuth } from "@/features/auth/AuthContext"
import { APP_NAME } from "@/lib/constants"

const navigation = [
  { label: "Dashboard", to: "/dashboard", icon: Gauge },
  { label: "RM Users", to: "/rm-users", icon: Users },
  { label: "Products", to: "/products", icon: Boxes },
  { label: "Competitors", to: "/competitors", icon: PackageSearch },
  { label: "Admin allow-list", to: "/admins", icon: ShieldCheck },
]

function getInitials(name: string | null, email: string | null) {
  const label = name?.trim() || email?.trim() || "Admin"
  return label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}

function SidebarNavigation() {
  const { pathname } = useLocation()

  return (
    <SidebarMenu>
      {navigation.map(({ label, to, icon: Icon }) => {
        const isActive = pathname === to || pathname.startsWith(`${to}/`)

        return (
          <SidebarMenuItem key={to}>
            <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
              <Link to={to}>
                <Icon />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    await logout()
  }

  // SidebarProvider owns collapse/mobile state; SidebarInset is the adjacent page area.
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
              SC
            </div>
            <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
              {APP_NAME}
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarNavigation />
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2 rounded-md px-2 py-2">
                <Avatar className="size-8 shrink-0">
                  <AvatarImage
                    src={user?.avatarUrl ?? undefined}
                    alt={user?.name ?? "Admin"}
                  />
                  <AvatarFallback>
                    {getInitials(user?.name ?? null, user?.email ?? null)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-medium text-sidebar-foreground">
                    {user?.name || "Admin"}
                  </p>
                  <p className="truncate text-xs text-sidebar-foreground/70">
                    {user?.email}
                  </p>
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 sm:px-6">
          <SidebarTrigger />
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage
                src={user?.avatarUrl ?? undefined}
                alt={user?.name ?? "Admin"}
              />
              <AvatarFallback>
                {getInitials(user?.name ?? null, user?.email ?? null)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-medium">{user?.name || "Admin"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">
                {isLoggingOut ? "Logging out…" : "Logout"}
              </span>
            </Button>
          </div>
        </header>

        <div className="flex-1 bg-muted/30 p-4 sm:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
