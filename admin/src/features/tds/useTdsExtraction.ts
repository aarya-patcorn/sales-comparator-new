import { useMutation } from "@tanstack/react-query"

import { apiUpload } from "@/lib/apiClient"
import {
  PARAM_FIELDS,
  type ParamKey,
  type TechnicalParams,
} from "@/lib/paramFields"

export type TdsExtractionResult = {
  params: Record<ParamKey, string | null>
  model: string
}

export function technicalParamsFromTds(
  params: TdsExtractionResult["params"],
): TechnicalParams {
  return Object.fromEntries(
    PARAM_FIELDS.map(([key]) => [key, params[key] ?? ""]),
  ) as TechnicalParams
}

// TDS extraction only suggests values. Each form decides what the admin confirms.
export function useTdsExtraction() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.set("file", file)
      return apiUpload<TdsExtractionResult>("/api/admin/tds/extract", formData)
    },
  })
}
