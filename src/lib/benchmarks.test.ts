import { describe, expect, test } from 'vitest'
import { KNOWN_TOOLS } from './benchmarks'

// Tests for forLayer / modelDisplayName / scoreTier / formatEpoch /
// FAMILIES were retired with the helpers themselves in chain
// telemetry-substrate-cleanup T1, alongside the dormant Matrix page
// and its ScenarioMatrix / ModelToggles / LayerToggle components that
// were the only consumers. Only KNOWN_TOOLS survives (consumed by
// _dormant/Scenarios), so only its tests survive.

describe('KNOWN_TOOLS', () => {
  // @blurb The work-server surface is exactly 41 tools as of the L6 coverage
  // @blurb pass; if this number drifts, the L4/L5/L6 dispatches in the
  // @blurb benchmarks crate likely drifted too — re-sync before changing this.
  test('has 41 entries', () => {
    expect(KNOWN_TOOLS).toHaveLength(41)
  })

  // @blurb KNOWN_TOOLS must be a superset of the L6 dispatch's tool list —
  // @blurb the L6 list is the canonical 41-tool set the benchmarks crate
  // @blurb sweeps. Mirror it here verbatim from scenarios_l6/mod.rs:for_tool_l6
  // @blurb so a drift on either side fails the test.
  test('covers the L6 dispatch tool set', () => {
    // Mirror of scenarios_l6/mod.rs:for_tool_l6 (groups annotated for readability).
    const l6Dispatch = new Set([
      // health / inspection
      'ping', 'project_tree', 'suggest_tools', 'validate_filename',
      'check_lifecycle_change', 'check_file_sizes',
      // read-side navigation
      'read_task', 'get_chain_state', 'chain_status', 'find_chain',
      'search_task_content',
      // bugs
      'bug_list', 'bug_read', 'bug_resolution_mix', 'bug_resolve', 'bug_reopen',
      'bug_stamp_resolved_sha',
      // forge
      'forge', 'forge_edit', 'forge_delete', 'forge_list',
      // task lifecycle — state transitions
      'start_task', 'complete_task', 'complete_tasks', 'cancel_task',
      'cancel_tasks', 'reopen_task',
      // task lifecycle — graph + ordering
      'block_task', 'unblock_task', 'move_task', 'reorder_tasks',
      // task content
      'populate_task_content', 'populate_task_content_batch',
      'edit_task_content', 'validate_task_content', 'check_task_closed',
      'close_chain',
      // skills
      'skill_load', 'skill_find', 'skill_list',
      // runtime
      'qwen_server',
    ])
    const known = new Set<string>(KNOWN_TOOLS)
    const missing = [...l6Dispatch].filter(t => !known.has(t))
    expect(missing).toEqual([])
  })

  // @blurb No duplicate slugs — the dropdown rendering uses tool name as the
  // @blurb React key; a duplicate would clobber list rendering silently.
  test('contains no duplicate entries', () => {
    expect(new Set(KNOWN_TOOLS).size).toBe(KNOWN_TOOLS.length)
  })
})
