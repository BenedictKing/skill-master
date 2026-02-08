import type { AgentPlatform, Capability } from '../types/index.js';

/**
 * Sparse capability mapping: only agents with known tool names are listed.
 * Agents not present here return null for all capabilities.
 */
const AGENT_CAPABILITIES: Partial<Record<AgentPlatform, Partial<Record<Capability, string>>>> = {
  'claude-code': {
    shell: 'Bash',
    read_file: 'Read',
    write_file: 'Write',
    edit_file: 'Edit',
    find_file: 'Glob',
    search_content: 'Grep',
    sub_task: 'Task',
    web_fetch: 'WebFetch',
    web_search: 'WebSearch',
  },
  opencode: {
    shell: 'bash',
    read_file: 'read',
    write_file: 'write',
    edit_file: 'edit',
    find_file: 'glob',
    search_content: 'grep',
  },
  cursor: {
    shell: 'run_terminal_cmd',
    read_file: 'read_file',
    write_file: 'write_to_file',
    edit_file: 'edit_file',
    find_file: 'list_dir',
    search_content: 'grep_search',
  },
  cline: {
    shell: 'execute_command',
    read_file: 'read_file',
    write_file: 'write_to_file',
    edit_file: 'replace_in_file',
    find_file: 'list_files',
    search_content: 'search_files',
  },
  windsurf: {
    shell: 'RunCommand',
    read_file: 'ReadFile',
    write_file: 'WriteFile',
    edit_file: 'EditFile',
    find_file: 'ListDir',
    search_content: 'Search',
  },
};

/** Get the tool name for a capability on a specific platform */
export function getToolName(capability: Capability, platform: AgentPlatform): string | null {
  return AGENT_CAPABILITIES[platform]?.[capability] ?? null;
}

/** Build a reverse map: tool name → capability for a given platform */
export function buildReverseMap(platform: AgentPlatform): Record<string, Capability> {
  const reverse: Record<string, Capability> = {};
  const caps = AGENT_CAPABILITIES[platform];
  if (caps) {
    for (const [cap, toolName] of Object.entries(caps)) {
      reverse[toolName] = cap as Capability;
    }
  }
  return reverse;
}

/** Check if a platform supports a given capability */
export function isCapabilitySupported(capability: Capability, platform: AgentPlatform): boolean {
  return getToolName(capability, platform) !== null;
}

/** Get all capabilities supported by a platform */
export function getSupportedCapabilities(platform: AgentPlatform): Capability[] {
  const caps = AGENT_CAPABILITIES[platform];
  return caps ? (Object.keys(caps) as Capability[]) : [];
}
