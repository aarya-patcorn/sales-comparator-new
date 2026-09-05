import { clearAdminToken, getAdminToken } from "@/lib/authStorage"
import { env } from "@/lib/env"

type BackendErrorBody = {
  error?: {
    code?: string
    message?: string
  }
}

type JsonRequestOptions = Omit<RequestInit, "body" | "method">

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

function buildUrl(path: string) {
  const baseUrl = env.apiUrl.endsWith("/") ? env.apiUrl : `${env.apiUrl}/`
  return new URL(path.replace(/^\//, ""), baseUrl)
}

function redirectToLogin() {
  if (window.location.pathname !== "/login") {
    window.location.assign("/login")
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined
  }

  const contentType = response.headers.get("content-type")
  if (!contentType?.includes("application/json")) {
    return undefined
  }

  return response.json()
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getAdminToken()

  // Every authenticated request reads the latest token from one shared place.
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(buildUrl(path), { ...init, headers })
  const body = await parseResponseBody(response)

  if (response.status === 401) {
    clearAdminToken()
    redirectToLogin()
  }

  if (!response.ok) {
    const backendError = body as BackendErrorBody | undefined
    const code = backendError?.error?.code ?? "request_failed"
    const message =
      backendError?.error?.message ??
      `API request failed with status ${response.status}`

    throw new ApiError(message, code, response.status)
  }

  return body as T
}

function jsonRequest<T>(
  method: "POST" | "PUT" | "PATCH",
  path: string,
  body?: unknown,
  options: JsonRequestOptions = {},
) {
  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json")

  return apiRequest<T>(path, {
    ...options,
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiGet<T>(path: string, options: JsonRequestOptions = {}) {
  return apiRequest<T>(path, { ...options, method: "GET" })
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  options?: JsonRequestOptions,
) {
  return jsonRequest<T>("POST", path, body, options)
}

export function apiPut<T>(
  path: string,
  body?: unknown,
  options?: JsonRequestOptions,
) {
  return jsonRequest<T>("PUT", path, body, options)
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  options?: JsonRequestOptions,
) {
  return jsonRequest<T>("PATCH", path, body, options)
}

export function apiDelete<T>(path: string, options: JsonRequestOptions = {}) {
  return apiRequest<T>(path, { ...options, method: "DELETE" })
}

export function apiUpload<T>(
  path: string,
  formData: FormData,
  options: JsonRequestOptions = {},
) {
  // The browser must set the multipart boundary, so no Content-Type is added.
  return apiRequest<T>(path, {
    ...options,
    method: "POST",
    body: formData,
  })
}
