import type { AgentPlatform, Capability } from '../types/index.js';

/**
 * Capability mapping: maps abstract capabilities to platform-specific tool names.
 * null means the platform does not support that capability.
 */
export const CAPABILITY_MAP: Record<Capability, Record<AgentPlatform, string | null>> = {
  shell: {
    'claude-code': 'Bash',
    'opencode': 'bash',
    'cursor': 'run_terminal_cmd',
    'cline': 'execute_command',
    'windsurf': 'RunCommand',
  },
  read_file: {
    'claude-code': 'Read',
    'opencode': 'read',
    'cursor': 'read_file',
    'cline': 'read_file',
    'windsurf': 'ReadFile',
  },
  write_file: {
    'claude-code': 'Write',
    'opencode': 'write',
    'cursor': 'write_to_file',
    'cline': 'write_to_file',
    'windsurf': 'WriteFile',
  },
  edit_file: {
    'claude-code': 'Edit',
    'opencode': 'edit',
    'cursor': 'edit_file',
    'cline': 'replace_in_file',
    'windsurf': 'EditFile',
  },
  find_file: {
    'claude-code': 'Glob',
    'opencode': 'glob',
    'cursor': 'list_dir',
    'cline': 'list_files',
    'windsurf': 'ListDir',
  },
  search_content: {
    'claude-code': 'Grep',
    'opencode': 'grep',
    'cursor': 'grep_search',
    'cline': 'search_files',
    'windsurf': 'Search',
  },
  sub_task: {
    'claude-code': 'Task',
    'opencode': null,
    'cursor': null,
    'cline': null,
    'windsurf': null,
  },
  web_fetch: {
    'claude-code': 'WebFetch',
    'opencode': null,
    'cursor': null,
    'cline': null,
    'windsurf': null,
  },
  web_search: {
    'claude-code': 'WebSearch',
    'opencode': null,
    'cursor': null,
    'cline': null,
    'windsurf': null,
  },
};

/** Build a reverse map: tool name → capability for a given platform */
export function buildReverseMap(platform: AgentPlatform): Record<string, Capability> {
  const reverse: Record<string, Capability> = {};
  for (const [cap, platformMap] of Object.entries(CAPABILITY_MAP)) {
    const toolName = platformMap[platform];
    if (toolName) {
      reverse[toolName] = cap as Capability;
    }
  }
  return reverse;
}

/** Get the tool name for a capability on a specific platform */
export function getToolName(capability: Capability, platform: AgentPlatform): string | null {
  return CAPABILITY_MAP[capability][platform];
}

/** Check if a platform supports a given capability */
export function isCapabilitySupported(capability: Capability, platform: AgentPlatform): boolean {
  return CAPABILITY_MAP[capability][platform] !== null;
}

/** Get all capabilities supported by a platform */
export function getSupportedCapabilities(platform: AgentPlatform): Capability[] {
  return (Object.entries(CAPABILITY_MAP) as Array<[Capability, Record<AgentPlatform, string | null>]>)
    .filter(([, map]) => map[platform] !== null)
    .map(([cap]) => cap);
}
