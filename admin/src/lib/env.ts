function readRequiredEnv(name: "VITE_API_URL" | "VITE_GOOGLE_CLIENT_ID") {
  const value = import.meta.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export const env = {
  apiUrl: readRequiredEnv("VITE_API_URL"),
  googleClientId: readRequiredEnv("VITE_GOOGLE_CLIENT_ID"),
} as const
