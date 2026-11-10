import { getToken } from '../../auth/session'
import { endSessionFor } from './sessionGuard'

/** A camera endpoint answered with a non-2xx status; `code` is the body's `{code}` when it had one. */
export class CameraRequestError extends Error {
  readonly status: number
  readonly code: string | undefined
  constructor(status: number, code?: string) {
    super(`Camera request failed (${status})`)
    this.name = 'CameraRequestError'
    this.status = status
    this.code = code
  }
}

/** `fetch` with the session's Bearer token. A 401 ends the session; any non-2xx throws `CameraRequestError`. */
export async function cameraFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(path, { ...init, headers })
  if (res.status === 401) endSessionFor(token)
  if (!res.ok) throw new CameraRequestError(res.status, await errorCode(res))
  return res
}

/** The `{code}` of an error body, if it has one. */
async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json()
    const code = (body as { code?: unknown } | null)?.code
    return typeof code === 'string' ? code : undefined
  } catch {
    return undefined
  }
}
