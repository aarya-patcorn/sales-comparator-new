import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { apiDelete, apiGet, apiPatch, apiPost, apiPut, apiUpload } from "@/lib/apiClient"
import { useTdsExtraction } from "@/features/tds/useTdsExtraction"
import type { ParamKey, TechnicalParams } from "@/lib/paramFields"

export type Competitor = {
  id: string
  name: string
  slug: string
  isActive: boolean
  productCount?: number
  createdAt: string
  updatedAt: string
}

export type CompetitorInput = {
  name: string
  slug: string
}

export type CompetitorProduct = {
  id: string
  competitorId: string
  competitorName?: string
  name: string
  enClassification: string | null
  competesWith: string | null
  specSource: "tds_ai" | "manual"
  tdsFileUrl: string | null
  tdsFileName: string | null
  aiModel: string | null
  isActive: boolean
  technicalParams: Record<ParamKey, string | null>
  createdAt: string
}

export type CompetitorProductInput = {
  competitorId: string
  name: string
  enClassification: string | null
  competesWith: string | null
  technicalParams: TechnicalParams
}

export type CompetitorProductUpdate = Omit<CompetitorProductInput, "competitorId">

type CompetitorListParams = {
  search: string
  page: number
  pageSize: number
}

type Pagination = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

type CompetitorListResponse = {
  competitors: Competitor[]
  pagination: Pagination
}

type CompetitorProductListResponse = {
  competitorProducts: CompetitorProduct[]
  pagination: Pagination
}

const competitorKeys = {
  all: ["admin", "competitors"] as const,
  list: (params: CompetitorListParams) =>
    [...competitorKeys.all, "list", params] as const,
  products: (competitorId: string) =>
    [...competitorKeys.all, competitorId, "products"] as const,
}

export function useCompetitors(params: CompetitorListParams) {
  return useQuery({
    queryKey: competitorKeys.list(params),
    queryFn: () => {
      const query = new URLSearchParams({
        page: String(params.page),
        pageSize: String(params.pageSize),
      })
      if (params.search.trim()) query.set("search", params.search.trim())

      return apiGet<CompetitorListResponse>(`/api/admin/competitors?${query}`)
    },
    placeholderData: keepPreviousData,
  })
}

export function useCompetitorProducts(competitorId: string) {
  return useQuery({
    queryKey: competitorKeys.products(competitorId),
    queryFn: () => {
      const query = new URLSearchParams({
        competitorId,
        page: "1",
        pageSize: "100",
      })
      return apiGet<CompetitorProductListResponse>(
        `/api/admin/competitor-products?${query}`,
      )
    },
    enabled: Boolean(competitorId),
  })
}

function useInvalidateCompetitors() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: competitorKeys.all })
}

export function useCreateCompetitor() {
  const invalidate = useInvalidateCompetitors()
  return useMutation({
    mutationFn: (input: CompetitorInput) =>
      apiPost<{ competitor: Competitor }>("/api/admin/competitors", input),
    onSuccess: invalidate,
  })
}

export function useUpdateCompetitor() {
  const invalidate = useInvalidateCompetitors()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CompetitorInput }) =>
      apiPut<{ competitor: Competitor }>(`/api/admin/competitors/${id}`, input),
    onSuccess: invalidate,
  })
}

export function useSetCompetitorStatus() {
  const invalidate = useInvalidateCompetitors()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ competitor: Competitor }>(`/api/admin/competitors/${id}/status`, {
        isActive,
      }),
    onSuccess: invalidate,
  })
}

export function useDeleteCompetitor() {
  const invalidate = useInvalidateCompetitors()
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/api/admin/competitors/${id}`),
    onSuccess: invalidate,
  })
}

export function useCreateCompetitorProduct() {
  const invalidate = useInvalidateCompetitors()

  return useMutation({
    mutationFn: async ({
      input,
      file,
    }: {
      input: CompetitorProductInput
      file?: File
    }) => {
      if (!file) {
        return apiPost<{ competitorProduct: CompetitorProduct }>(
          "/api/admin/competitor-products",
          input,
        )
      }

      const formData = new FormData()
      formData.set("file", file)
      formData.set("competitorId", input.competitorId)
      formData.set("name", input.name)
      formData.set("enClassification", input.enClassification ?? "")
      formData.set("competesWith", input.competesWith ?? "")
      formData.set("technicalParams", JSON.stringify(input.technicalParams))

      return apiUpload<{ competitorProduct: CompetitorProduct }>(
        "/api/admin/competitor-products",
        formData,
      )
    },
    onSuccess: invalidate,
  })
}

export function useUpdateCompetitorProduct() {
  const invalidate = useInvalidateCompetitors()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CompetitorProductUpdate }) =>
      apiPut<{ competitorProduct: CompetitorProduct }>(
        `/api/admin/competitor-products/${id}`,
        input,
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteCompetitorProduct() {
  const invalidate = useInvalidateCompetitors()
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<void>(`/api/admin/competitor-products/${id}`),
    onSuccess: invalidate,
  })
}

// Keep the old feature-local name for existing callers while sharing one hook.
export const useExtractTds = useTdsExtraction
