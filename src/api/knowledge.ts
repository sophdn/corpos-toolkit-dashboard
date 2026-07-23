import { get } from '../lib/http'
import { withProjectQuery } from '../hooks/useProject'
import type { KnowledgeIndexCard } from '../lib/knowledgeCard'

interface CardOptions {
  signal?: AbortSignal
  project?: string
}

export function getKnowledgeIndexCard(opts: CardOptions = {}): Promise<KnowledgeIndexCard> {
  const path = withProjectQuery('/knowledge/index-card', opts.project)
  return get<KnowledgeIndexCard>(path, opts.signal)
}
