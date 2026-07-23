// Relative "Ns/m/h/d ago" formatting for a last-activity timestamp. Shared by the
// Inference health cards and the Model Ranking page (chain
// telemetry-page-ia-unification extracted this when the per-tool-per-model
// ranking moved to its own page, so both surfaces format last-call identically).
//
// The server returns SQLite datetime strings ("YYYY-MM-DD HH:MM:SS", UTC); we
// append "Z" so the JS parser treats them as UTC. null -> "never"; an
// unparseable value is returned verbatim.
export function formatRelativeTime(ts: string | null): string {
  if (ts == null) return 'never'
  const parsed = Date.parse(ts.replace(' ', 'T') + 'Z')
  if (Number.isNaN(parsed)) return ts
  const ageSec = (Date.now() - parsed) / 1000
  if (ageSec < 60) return `${Math.floor(ageSec)}s ago`
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`
  return `${Math.floor(ageSec / 86400)}d ago`
}
