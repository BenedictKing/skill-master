import { listRegistry } from '../core/registry.js';

export async function detectSkillConflicts(skillName: string): Promise<string[]> {
  const registry = await listRegistry();
  const conflicts: string[] = [];
  const names = Object.keys(registry);

  for (const name of names) {
    if (name === skillName) continue;
    if (name.toLowerCase() === skillName.toLowerCase()) {
      conflicts.push(`Case-insensitive duplicate: ${name}`);
    }
  }

  return conflicts;
}
