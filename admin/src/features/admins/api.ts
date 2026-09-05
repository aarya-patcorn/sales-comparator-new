import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiGet, apiPatch, apiPost } from "@/lib/apiClient"

export type AdminUser = {
  id: string
  email: string | null
  name: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

type AdminListParams = { search: string; page: number; pageSize: number }
type AdminListResponse = {
  admins: AdminUser[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

const adminKeys = {
  all: ["admin", "allow-list"] as const,
  list: (params: AdminListParams) => [...adminKeys.all, "list", params] as const,
}

export function useAdminUsers(params: AdminListParams) {
  return useQuery({
    queryKey: adminKeys.list(params),
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })
      if (params.search.trim()) query.set("search", params.search.trim())
      return apiGet<AdminListResponse>(`/api/admin/admins?${query}`)
    },
    placeholderData: keepPreviousData,
  })
}

function useInvalidateAdmins() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: adminKeys.all })
}

export function useCreateAdminUser() {
  const invalidate = useInvalidateAdmins()
  return useMutation({
    mutationFn: (input: { email: string; name?: string }) =>
      apiPost<{ user: AdminUser }>("/api/admin/admins", input),
    onSuccess: invalidate,
  })
}

export function useSetAdminStatus() {
  const invalidate = useInvalidateAdmins()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ user: AdminUser }>(`/api/admin/admins/${id}/status`, { isActive }),
    onSuccess: invalidate,
  })
}
