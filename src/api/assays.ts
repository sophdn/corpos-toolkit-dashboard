import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'
import type {
  AssayRunDetail,
  AssayRunDetailWire,
  AssayRunRow,
  AssayRunWire,
  AssayScore,
  AssayScoreWire,
} from '../lib/assays'

export interface AssayFilters {
  assay?: string
  model_id?: string
  status?: string
  limit?: number
  signal?: AbortSignal
  project?: string
}

function adaptRunRow(row: AssayRunWire): AssayRunRow {
  return {
    run_id: row.run_id,
    name: row.name,
    assay: row.assay,
    item_id: row.item_id,
    image_ref: row.image_ref,
    image_digest: row.image_digest,
    model_id: row.model_id,
    model_version: row.model_version,
    status: row.status,
    error: row.error,
    run_at: row.run_at,
  }
}

function adaptScore(score: AssayScoreWire): AssayScore {
  return {
    condition: score.condition,
    run: score.run,
    verdict_kind: score.verdict_kind,
    verdict_reason: score.verdict_reason,
    item: score.item,
    rationale: score.rationale,
  }
}

function adaptRunDetail(wire: AssayRunDetailWire): AssayRunDetail {
  return {
    ...adaptRunRow(wire),
    study_digest: wire.study_digest,
    materials_hashes: wire.materials_hashes ?? {},
    responses_dir: wire.responses_dir,
    scores: (wire.scores ?? []).map(adaptScore),
  }
}

/**
 * List study runs. `GET /study-runs` returns a BARE JSON array of run
 * summaries; optional assay / model_id / status / limit / project query
 * params narrow it server-side.
 */
export async function listAssays(filters?: AssayFilters): Promise<AssayRunRow[]> {
  const params = new URLSearchParams()
  if (filters?.assay) params.set('assay', filters.assay)
  if (filters?.model_id) params.set('model_id', filters.model_id)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.limit != null) params.set('limit', String(filters.limit))
  let path = params.size > 0 ? `/study-runs?${params}` : '/study-runs'
  path = withProjectQuery(path, filters?.project)
  const rows = await get<AssayRunWire[]>(path, filters?.signal)
  return rows.map(adaptRunRow)
}

/**
 * Read one study run's full detail — provenance (study_digest,
 * materials_hashes, responses_dir) plus the per-condition scores —
 * from `GET /study-runs/{run_id}`.
 */
export async function getAssayDetail(
  runId: string,
  opts: { signal?: AbortSignal; project?: string } = {},
): Promise<AssayRunDetail> {
  const path = withProjectQuery(`/study-runs/${encodeURIComponent(runId)}`, opts.project)
  const wire = await get<AssayRunDetailWire>(path, opts.signal)
  return adaptRunDetail(wire)
}
