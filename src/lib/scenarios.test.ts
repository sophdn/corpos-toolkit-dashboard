import { describe, expect, test } from 'vitest'
import {
  filterScenarios,
  groupByToolThenLayer,
  type L4ScenarioEntry,
  type L5ScenarioEntry,
  type L6ScenarioEntry,
  type ScenarioEntry,
} from './scenarios'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const L4_BUG_LIST: L4ScenarioEntry = {
  layer: 'l4',
  id: 'l4-bl-status-open',
  tool_name: 'bug_list',
  user_prompt: 'Show me all currently open bugs.',
  expected_args: [{ name: 'status', kind: 'exact', value: 'open' }],
}

const L5_BUG_LIST: L5ScenarioEntry = {
  layer: 'l5',
  id: 'l5-bl-open-count',
  tool_name: 'bug_list',
  tool_output: '[{"slug":"foo","status":"open"}]',
  question: 'How many bugs are listed?',
  expected_answer: '1',
}

const L6_BUG_LIST_ROUTE: L6ScenarioEntry = {
  layer: 'l6',
  id: 'l6-bl-route-to-resolution-mix',
  tool_name: 'bug_list',
  user_prompt: 'I want aggregate counts of fixed vs open vs wontfix.',
  expected_decision: { kind: 'route_to', route_to: 'bug_resolution_mix' },
}

const L4_PING: L4ScenarioEntry = {
  layer: 'l4',
  id: 'l4-ping-healthcheck',
  tool_name: 'ping',
  user_prompt: 'Check that the server is alive.',
  expected_args: [],
}

const ALL: ScenarioEntry[] = [L4_BUG_LIST, L5_BUG_LIST, L6_BUG_LIST_ROUTE, L4_PING]

// ---------------------------------------------------------------------------
// filterScenarios
// ---------------------------------------------------------------------------

describe('filterScenarios — layer filter', () => {
  // @blurb 'all' is the default and keeps every entry; the page renders
  // @blurb the corpus unmodified when no filter is applied.
  test("layer='all' keeps every entry", () => {
    expect(filterScenarios(ALL, 'all', 'all', '')).toEqual(ALL)
  })

  // @blurb Filtering to a specific layer returns only entries with that
  // @blurb discriminator, regardless of tool or search state.
  test("layer='l5' returns only L5 entries", () => {
    const result = filterScenarios(ALL, 'l5', 'all', '')
    expect(result).toEqual([L5_BUG_LIST])
  })

  test("layer='l6' returns only L6 entries", () => {
    const result = filterScenarios(ALL, 'l6', 'all', '')
    expect(result).toEqual([L6_BUG_LIST_ROUTE])
  })
})

describe('filterScenarios — tool filter', () => {
  // @blurb 'all' keeps every tool's entries (default state).
  test("tool='all' keeps every entry", () => {
    expect(filterScenarios(ALL, 'all', 'all', '').length).toBe(4)
  })

  // @blurb Filtering by a specific tool name returns the cross-layer set
  // @blurb for that tool; bug_list has 3 entries (L4 + L5 + L6).
  test("tool='bug_list' returns cross-layer set for bug_list", () => {
    const result = filterScenarios(ALL, 'all', 'bug_list', '')
    expect(result).toHaveLength(3)
    expect(result.every(e => e.tool_name === 'bug_list')).toBe(true)
  })

  // @blurb An unknown tool name returns no entries — the page renders the
  // @blurb empty state when no scenarios match.
  test("tool='unknown' returns empty", () => {
    expect(filterScenarios(ALL, 'all', 'unknown_tool', '')).toEqual([])
  })
})

describe('filterScenarios — combined filters', () => {
  // @blurb Layer + tool intersect — bug_list × L4 returns just the L4 entry.
  test('layer + tool filters intersect', () => {
    const result = filterScenarios(ALL, 'l4', 'bug_list', '')
    expect(result).toEqual([L4_BUG_LIST])
  })
})

describe('filterScenarios — search', () => {
  // @blurb Empty / whitespace-only search keeps every entry the layer +
  // @blurb tool filters retain — search applies on top, never as a gate.
  test('empty search keeps every entry', () => {
    expect(filterScenarios(ALL, 'all', 'all', '   ').length).toBe(4)
  })

  // @blurb Search matches the entry's id substring case-insensitively, so
  // @blurb a reviewer can paste a scenario id from a log and find the row.
  test('matches against id (case-insensitive)', () => {
    expect(filterScenarios(ALL, 'all', 'all', 'L4-BL')).toHaveLength(1)
  })

  // @blurb L5 entries match against tool_output text — useful for finding
  // @blurb scenarios with a specific synthetic JSON shape.
  test('L5 search matches tool_output text', () => {
    expect(filterScenarios(ALL, 'all', 'all', 'foo')).toContainEqual(L5_BUG_LIST)
  })

  // @blurb L6 entries match against the route_to target name so reviewers
  // @blurb can find every "this should route to <X>" scenario.
  test('L6 search matches route_to target name', () => {
    const result = filterScenarios(ALL, 'all', 'all', 'bug_resolution_mix')
    expect(result).toContainEqual(L6_BUG_LIST_ROUTE)
  })

  // @blurb L4 entries match against expected_args values too — useful when
  // @blurb auditing scenarios that pin a specific slug or arg.
  test('L4 search matches expected_args value', () => {
    const result = filterScenarios(ALL, 'all', 'all', 'open')
    // Both L4 bug_list (expected_args.value='open') and L5 bug_list (tool_output contains 'open') match.
    expect(result).toContain(L4_BUG_LIST)
    expect(result).toContain(L5_BUG_LIST)
  })
})

// ---------------------------------------------------------------------------
// groupByToolThenLayer
// ---------------------------------------------------------------------------

describe('groupByToolThenLayer', () => {
  // @blurb Tools are sorted alphabetically; per tool, layers are emitted
  // @blurb in canonical L4 → L5 → L6 order so the rendered page is stable
  // @blurb regardless of input order.
  test('groups entries by tool then layer in canonical order', () => {
    const groups = groupByToolThenLayer(ALL)
    // bug_list before ping (alphabetical).
    expect(groups.map(g => g.tool)).toEqual(['bug_list', 'ping'])
    const bugList = groups[0]
    expect(bugList.byLayer.map(b => b.layer)).toEqual(['l4', 'l5', 'l6'])
    expect(bugList.byLayer[0].entries).toEqual([L4_BUG_LIST])
    expect(bugList.byLayer[1].entries).toEqual([L5_BUG_LIST])
    expect(bugList.byLayer[2].entries).toEqual([L6_BUG_LIST_ROUTE])
  })

  // @blurb A tool that only has entries for one layer renders just that
  // @blurb layer group — empty layer groups are NOT included so the
  // @blurb rendered output is dense.
  test('omits layer groups for tools with no entries in that layer', () => {
    const groups = groupByToolThenLayer([L4_PING])
    expect(groups[0].byLayer).toHaveLength(1)
    expect(groups[0].byLayer[0].layer).toBe('l4')
  })

  // @blurb Empty input produces no groups.
  test('empty input returns empty array', () => {
    expect(groupByToolThenLayer([])).toEqual([])
  })
})
