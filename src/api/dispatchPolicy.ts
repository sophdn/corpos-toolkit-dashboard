import { get } from '../lib/http'

/**
 * Shape of GET /admin/dispatch-policy from go/internal/observehttp/admin.go.
 *
 * The endpoint reads action-manifests/dispatch-policy.toml fresh on
 * each request; this client should NOT cache the response. See
 * docs/SUBSTRATE_FRONTEND.md §8.3.
 */
export interface DispatchPolicyResponse {
  path: string
  loaded: boolean
  surfaces: Record<string, Record<string, { requires_rationale: boolean }>>
}

/** GET /admin/dispatch-policy — see DispatchPolicyResponse. */
export async function getDispatchPolicy(signal?: AbortSignal): Promise<DispatchPolicyResponse> {
  return get<DispatchPolicyResponse>('/admin/dispatch-policy', signal)
}
