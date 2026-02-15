/** Base error class for skill-master */
export class SkillManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillManagerError';
  }
}

/** Skill not found in registry or filesystem */
export class SkillNotFoundError extends SkillManagerError {
  constructor(skillName: string) {
    super(`Skill "${skillName}" not found`);
    this.name = 'SkillNotFoundError';
  }
}

/** Required .env key is missing */
export class EnvMissingError extends SkillManagerError {
  constructor(skillName: string, keys: string[]) {
    super(`Skill "${skillName}" is missing env keys: ${keys.join(', ')}`);
    this.name = 'EnvMissingError';
  }
}

/** Registry file is corrupted or invalid */
export class RegistryCorruptError extends SkillManagerError {
  constructor(detail?: string) {
    super(`Registry is corrupted${detail ? ': ' + detail : ''}`);
    this.name = 'RegistryCorruptError';
  }
}

/** Git clone operation failed */
export class GitCloneError extends SkillManagerError {
  constructor(url: string, detail?: string) {
    super(`Failed to clone "${url}"${detail ? ': ' + detail : ''}`);
    this.name = 'GitCloneError';
  }
}

/** SKILL.md parsing or validation failed */
export class SkillParseError extends SkillManagerError {
  constructor(detail: string) {
    super(`Failed to parse SKILL.md: ${detail}`);
    this.name = 'SkillParseError';
  }
}

/** Platform detection failed or unsupported */
export class PlatformError extends SkillManagerError {
  constructor(detail: string) {
    super(`Platform error: ${detail}`);
    this.name = 'PlatformError';
  }
}

/** Source string parsing failed */
export class SourceParseError extends SkillManagerError {
  constructor(source: string, detail?: string) {
    super(`Failed to parse source "${source}"${detail ? ': ' + detail : ''}`);
    this.name = 'SourceParseError';
  }
}
