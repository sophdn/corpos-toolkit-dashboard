import { Link, useParams, useSearchParams } from 'react-router-dom'
import { QueryTrajectoryView } from '../../components/shared/QueryTrajectoryView'
import styles from './QueryTrajectoryView.module.css'

/**
 * QueryTrajectoryViewPage — standalone page at
 * /telemetry/trajectories/:queryId. Wraps the shared
 * <QueryTrajectoryView> with back-navigation. The :queryId path segment
 * is the grounding_events.id integer; an optional ?span_id query param
 * is honored when :queryId is the literal 'by-span' sentinel (so the
 * span-deep-link case has a stable URL shape too).
 *
 * Routes added to apps/dashboard/src/router/index.tsx per QF1 design
 * §8. The trajectory view is NOT in the sidebar — it's deep-link only;
 * operators arrive via the analytics page (QF4), the training-pair
 * browser (QF5), or the audit-ledger event-detail expansion.
 */
export function QueryTrajectoryViewPage() {
  const params = useParams<{ queryId: string }>()
  const [searchParams] = useSearchParams()

  const rawQueryId = params.queryId
  const parsedId = rawQueryId !== undefined ? Number.parseInt(rawQueryId, 10) : NaN
  const useSpanForm = rawQueryId === 'by-span'
  const spanId = searchParams.get('span_id') ?? undefined

  return (
    <div className={styles.page} data-testid="trajectory-page">
      <header className={styles.header}>
        <Link to="/audit" className={styles.backLink} data-testid="trajectory-back">
          ← audit ledger
        </Link>
        <h2 className={styles.title}>Query Trajectory</h2>
      </header>
      {useSpanForm && spanId !== undefined ? (
        <QueryTrajectoryView spanId={spanId} />
      ) : Number.isFinite(parsedId) && parsedId > 0 ? (
        <QueryTrajectoryView queryId={parsedId} />
      ) : (
        <p className={styles.error} role="alert" data-testid="trajectory-page-bad-id">
          Invalid trajectory link. Expected /telemetry/trajectories/:queryId
          (integer) or /telemetry/trajectories/by-span?span_id=&lt;uuid&gt;.
        </p>
      )}
    </div>
  )
}
