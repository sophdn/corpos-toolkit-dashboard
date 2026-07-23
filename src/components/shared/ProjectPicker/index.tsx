import { useEffect, useRef, useState } from 'react'
import { listProjects, type ProjectInfo } from '../../../api/admin'
import { ALL_PROJECTS } from '../../../hooks/useProject'
import styles from './ProjectPicker.module.css'

interface ProjectPickerProps {
  value: string
  onChange: (next: string) => void
}

/**
 * Page-scoped dropdown that filters one page's queries by `project_id`.
 * Controlled — the host page owns the value via useProject() (or any
 * useState). Probes `/projects` once on mount; if the probe fails, still
 * renders with just the All-Projects option so the picker doesn't block
 * UI.
 */
export function ProjectPicker({ value, onChange }: ProjectPickerProps) {
  const [options, setOptions] = useState<ProjectInfo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    listProjects(ctrl.signal)
      .then(rows => {
        setOptions(rows)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [])

  return (
    <label className={styles.picker} data-testid="project-picker">
      <span className={styles.label}>Project</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={loading && options.length === 0}
        data-testid="project-picker-select"
      >
        <option value={ALL_PROJECTS}>All projects</option>
        {options.map(p => (
          <option key={p.id} value={p.id}>
            {p.name || p.id}
          </option>
        ))}
      </select>
    </label>
  )
}
