import type { ParsedSkill, SkillFrontmatter } from '../types/index.js';

export function mergeStrategyDescription(skillNames: string[]): string[] {
  if (skillNames.length === 0) return ['No skill names provided'];
  return [
    `Merge ${skillNames.join(', ')}`,
    'Combine allowed-tools and capabilities',
    'Preserve provenance in generated package files',
  ];
}

export function mergeFrontmatter(skills: ParsedSkill[], fallbackName: string): SkillFrontmatter {
  const base = skills[0]?.frontmatter ?? { name: fallbackName };
  const allowedTools = [...new Set(skills.flatMap((skill) => skill.frontmatter['allowed-tools'] ?? []))];
  const capabilities = [...new Set(skills.flatMap((skill) => skill.frontmatter.capabilities ?? []))];
  const descriptions = skills
    .map((skill) => skill.frontmatter.description)
    .filter((value): value is string => Boolean(value));

  return {
    ...base,
    name: fallbackName,
    description: descriptions.length > 0
      ? `Composed skill: ${descriptions.join(' | ')}`
      : `Composed from ${skills.map((skill) => skill.frontmatter.name).join(', ')}`,
    'allowed-tools': allowedTools,
    capabilities,
    'user-invocable': true,
  };
}

export function mergeBodies(skills: ParsedSkill[]): string {
  return skills.map((skill) => {
    const title = `## Source: ${skill.frontmatter.name}`;
    const summary = skill.frontmatter.description ? `> ${skill.frontmatter.description}\n` : '';
    return `${title}\n\n${summary}${skill.body.trim()}`;
  }).join('\n\n');
}
