const BASE_URL = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? 'http://localhost:3001'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`HTTP ${status}: ${message}`)
    this.name = 'HttpError'
  }
}

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { signal, cache: 'no-store' })
  if (!res.ok) {
    throw new HttpError(res.status, await res.text())
  }
  return res.json() as Promise<T>
}

export async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    throw new HttpError(res.status, await res.text())
  }
  return res.json() as Promise<T>
}
