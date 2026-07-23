/**
 * Canonical work-server tool surface — must match the L6 dispatch in
 * `mcp-servers/benchmarks/src/scenarios_l6/mod.rs::for_tool_l6`. Used by
 * the dormant Scenarios corpus page. When a new work-server tool ships,
 * add it here and to the L4/L5/L6 dispatches in the benchmarks crate;
 * the unit test `KNOWN_TOOLS covers the L6 dispatch tool set` enforces
 * the link.
 *
 * Pre-cleanup this file also held BenchmarkResponse / TimeseriesResponse
 * shapes + per-layer adapters (forLayer, modelDisplayName, scoreTier,
 * formatEpoch, FAMILIES) used by the dormant Matrix page and its
 * ScenarioMatrix / ModelToggles / LayerToggle components. All of those
 * went out with the chain `telemetry-substrate-cleanup` T1 cleanup;
 * only KNOWN_TOOLS survived (still consumed by _dormant/Scenarios).
 */
export const KNOWN_TOOLS = [
  'ping', 'project_tree', 'read_task', 'get_chain_state', 'chain_status',
  'find_chain', 'search_task_content', 'bug_list', 'bug_read',
  'bug_resolution_mix', 'suggest_tools', 'validate_filename',
  'check_lifecycle_change', 'check_file_sizes', 'skill_load', 'skill_find',
  'skill_list', 'forge_list', 'forge', 'forge_edit', 'forge_delete',
  'qwen_server', 'start_task', 'complete_task', 'complete_tasks', 'cancel_task',
  'cancel_tasks', 'reopen_task', 'block_task', 'unblock_task', 'move_task',
  'reorder_tasks', 'populate_task_content', 'populate_task_content_batch',
  'edit_task_content', 'close_chain', 'validate_task_content',
  'check_task_closed', 'bug_resolve', 'bug_reopen', 'bug_stamp_resolved_sha',
] as const
export type KnownTool = (typeof KNOWN_TOOLS)[number]
