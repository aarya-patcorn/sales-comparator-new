import { useQuery } from "@tanstack/react-query"

import { apiGet } from "@/lib/apiClient"

export type DashboardSummary = {
  rmUsers: {
    total: number
    active: number
  }
  products: {
    total: number
    active: number
  }
}

export function useDashboard() {
  return useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => apiGet<DashboardSummary>("/api/admin/dashboard"),
  })
}
