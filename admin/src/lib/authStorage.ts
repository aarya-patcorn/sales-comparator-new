const ADMIN_TOKEN_KEY = "sales-comparator-admin-token"

// The raw token is intentionally kept behind this small storage boundary.
export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY)
}

export function saveAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}
