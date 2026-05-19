const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8010') + '/api/v1'

function extractMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'detail' in err) {
    const d = (err as { detail: unknown }).detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d[0]?.message) return d[0].message
  }
  return fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(extractMessage(body, `HTTP ${res.status}`))
  }
  return res.json() as Promise<T>
}

export const apiGet  = <T>(path: string)                       => request<T>(path)
export const apiPost = <T>(path: string, body: unknown)        => request<T>(path, { method: 'POST',  body: JSON.stringify(body) })
export const apiPatch= <T>(path: string, body: unknown)        => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const apiPut  = <T>(path: string, body: unknown)        => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) })
