export interface PositionalArgs {
  source: string;
  skill?: string;
}

/**
 * Parse source and optional skill from positional arguments.
 * Supports gh skill style: <repo> <skill>
 *
 * @param args - Raw CLI arguments (may include flags)
 * @returns { source, skill? } - First positional is source, second is skill
 *
 * @example
 * parseSourceAndSkill(['owner/repo', 'skill-name', '-g'])
 * // => { source: 'owner/repo', skill: 'skill-name' }
 *
 * parseSourceAndSkill(['owner/repo@skill'])
 * // => { source: 'owner/repo@skill' }
 */
export function parseSourceAndSkill(args: string[]): PositionalArgs {
  const positional = args.filter(arg => !arg.startsWith('-'));

  if (positional.length === 0) {
    return { source: '' };
  }

  if (positional.length === 1) {
    return { source: positional[0] };
  }

  // Two or more positional args: first is source, second is skill
  return { source: positional[0], skill: positional[1] };
}
