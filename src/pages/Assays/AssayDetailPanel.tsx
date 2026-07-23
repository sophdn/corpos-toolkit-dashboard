import { formatUpdatedAt } from '../../lib/chainIndex'
import {
  abbreviateVerdict,
  pivotScores,
  runStatusToSemantic,
  verdictToSemantic,
  type AssayRunDetail,
} from '../../lib/assays'
import styles from './Assays.module.css'

export interface AssayDetailPanelProps {
  detail: AssayRunDetail | null
  loading: boolean
  error: string | null
}

export function AssayDetailPanel({ detail, loading, error }: AssayDetailPanelProps) {
  if (loading) {
    return (
      <p data-testid="assay-detail-loading" className={styles.detailPlaceholder}>
        Loading…
      </p>
    )
  }

  if (error) {
    return (
      <p data-testid="assay-detail-error" className={styles.detailPlaceholder}>
        {error}
      </p>
    )
  }

  if (!detail) return null

  const grid = pivotScores(detail.scores)
  const statusSemantic = runStatusToSemantic(detail.status)
  const materials = Object.entries(detail.materials_hashes)

  return (
    <div data-testid="assay-detail-body" className={styles.detailBody}>
      <div data-testid="assay-detail-run-id" className={styles.detailSlug}>
        {detail.run_id}
      </div>
      <p className={styles.detailTitle}>{detail.name}</p>

      {/* Provenance */}
      <div className={styles.detailMeta}>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Status</span>
          <span
            data-testid="assay-detail-status"
            className={`${styles.statusBadge} ${styles[`status--${statusSemantic}`] ?? ''}`}
            data-status={detail.status}
          >
            {detail.status}
          </span>
        </div>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Assay</span>
          <span className={styles.detailMetaValue}>{detail.assay}</span>
        </div>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Model</span>
          <span data-testid="assay-detail-model" className={styles.detailMetaMono}>
            {detail.model_id}
            {detail.model_version ? ` (${detail.model_version})` : ''}
          </span>
        </div>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Image digest</span>
          <span data-testid="assay-detail-image-digest" className={styles.detailMetaMono}>
            {detail.image_digest}
          </span>
        </div>
        <div className={styles.detailMetaRow}>
          <span className={styles.detailMetaLabel}>Run date</span>
          <span data-testid="assay-detail-run-at" className={styles.detailMetaValue}>
            {formatUpdatedAt(detail.run_at)}
          </span>
        </div>
        {detail.study_digest && (
          <div className={styles.detailMetaRow}>
            <span className={styles.detailMetaLabel}>Study digest</span>
            <span data-testid="assay-detail-study-digest" className={styles.detailMetaMono}>
              {detail.study_digest}
            </span>
          </div>
        )}
        {detail.responses_dir && (
          <div className={styles.detailMetaRow}>
            <span className={styles.detailMetaLabel}>Responses</span>
            <span className={styles.detailMetaMono}>{detail.responses_dir}</span>
          </div>
        )}
      </div>

      {materials.length > 0 && (
        <div className={styles.detailSection}>
          <div className={styles.detailSectionLabel}>Materials</div>
          <div data-testid="assay-detail-materials" className={styles.detailMeta}>
            {materials.map(([name, hash]) => (
              <div key={name} className={styles.detailMetaRow}>
                <span className={styles.detailMetaLabel}>{name}</span>
                <span className={styles.detailMetaMono}>{hash}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score grid — condition × run */}
      <div className={styles.detailSection}>
        <div className={styles.detailSectionLabel}>Scores</div>
        {grid.rows.length === 0 ? (
          <>
            {detail.error ? (
              <pre data-testid="assay-run-error" className={styles.errorBlock}>
                {detail.error}
              </pre>
            ) : null}
            <p data-testid="assay-scores-empty" className={styles.detailSectionBody}>
              No scores recorded for this run.
            </p>
          </>
        ) : (
          <table className={styles.table} data-testid="assay-score-grid">
            <thead>
              <tr>
                <th>Condition</th>
                {grid.runs.map(run => (
                  <th key={run}>Run {run}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map(row => (
                <tr key={row.condition} data-testid={`assay-score-row-${row.condition}`}>
                  <td>
                    <span className={styles.conditionCell}>{row.condition}</span>
                  </td>
                  {row.cells.map((cell, i) => {
                    const run = grid.runs[i]
                    if (!cell) {
                      return (
                        <td key={run} data-testid={`assay-score-cell-${row.condition}-${run}`}>
                          <span className={styles.verdictEmpty}>—</span>
                        </td>
                      )
                    }
                    const semantic = verdictToSemantic(cell.verdict_kind)
                    return (
                      <td
                        key={run}
                        data-testid={`assay-score-cell-${row.condition}-${run}`}
                        title={cell.verdict_reason || cell.rationale}
                      >
                        <span
                          className={`${styles.verdictChip} ${styles[`verdict--${semantic}`] ?? ''}`}
                          data-verdict={cell.verdict_kind}
                        >
                          {abbreviateVerdict(cell.verdict_kind)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
