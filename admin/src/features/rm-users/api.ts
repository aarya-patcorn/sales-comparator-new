import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/apiClient"

export type RmUser = {
  id: string
  name: string | null
  email: string | null
  mobileNumber: string
  isActive: boolean
  createdAt: string
}

export type RmUserInput = {
  name: string
  mobileNumber: string
  email: string | null
}

type RmUserListParams = {
  search: string
  page: number
  pageSize: number
}

type RmUserListResponse = {
  users: RmUser[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const rmUserKeys = {
  all: ["admin", "rm-users"] as const,
  list: (params: RmUserListParams) => [...rmUserKeys.all, "list", params] as const,
}

export function useRmUsers(params: RmUserListParams) {
  return useQuery({
    queryKey: rmUserKeys.list(params),
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })

      if (params.search.trim()) query.set("search", params.search.trim())

      return apiGet<RmUserListResponse>(`/api/admin/users?${query}`)
    },
    placeholderData: keepPreviousData,
  })
}

function useInvalidateRmUsers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: rmUserKeys.all })
}

export function useCreateRmUser() {
  const invalidate = useInvalidateRmUsers()

  return useMutation({
    mutationFn: (input: RmUserInput) =>
      apiPost<{ user: RmUser }>("/api/admin/users", input),
    onSuccess: invalidate,
  })
}

export function useUpdateRmUser() {
  const invalidate = useInvalidateRmUsers()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RmUserInput }) =>
      apiPut<{ user: RmUser }>(`/api/admin/users/${id}`, input),
    onSuccess: invalidate,
  })
}

export function useSetRmUserStatus() {
  const invalidate = useInvalidateRmUsers()

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ user: RmUser }>(`/api/admin/users/${id}/status`, {
        isActive,
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteRmUser() {
  const invalidate = useInvalidateRmUsers()

  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/api/admin/users/${id}`),
    onSuccess: invalidate,
  })
}
