import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/apiClient"
import type { ParamKey, TechnicalParams } from "@/lib/paramFields"

export type Product = {
  id: string
  code: string
  name: string
  description: string | null
  enClassification: string | null
  applicationAreas: string[]
  technicalParams: Record<ParamKey, string | null>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type ProductInput = {
  code: string
  name: string
  description: string | null
  enClassification: string | null
  applicationAreas: string[]
  technicalParams: TechnicalParams
}

export type ProductStatusFilter = "all" | "active" | "inactive"

type ProductListParams = {
  search: string
  status: ProductStatusFilter
  page: number
  pageSize: number
}

type ProductListResponse = {
  products: Product[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const productKeys = {
  all: ["admin", "products"] as const,
  list: (params: ProductListParams) => [...productKeys.all, "list", params] as const,
}

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })

      if (params.search.trim()) query.set("search", params.search.trim())
      if (params.status !== "all") {
        query.set("isActive", String(params.status === "active"))
      }

      return apiGet<ProductListResponse>(`/api/admin/products?${query}`)
    },
    placeholderData: keepPreviousData,
  })
}

function useInvalidateProducts() {
  const queryClient = useQueryClient()

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: productKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
    ])
  }
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts()

  return useMutation({
    mutationFn: (input: ProductInput) =>
      apiPost<{ product: Product }>("/api/admin/products", input),
    onSuccess: invalidate,
  })
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductInput }) =>
      apiPut<{ product: Product }>(`/api/admin/products/${id}`, input),
    onSuccess: invalidate,
  })
}

export function useSetProductStatus() {
  const invalidate = useInvalidateProducts()

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ product: Product }>(`/api/admin/products/${id}/status`, {
        isActive,
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteProduct() {
  const invalidate = useInvalidateProducts()

  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/api/admin/products/${id}`),
    onSuccess: invalidate,
  })
}
