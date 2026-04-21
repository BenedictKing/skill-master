import type { TaskRequirement, Capability, CandidateRiskLevel } from '../types/index.js';

const KEYWORD_CAPABILITY_MAP: Array<{ pattern: RegExp; capability: Capability }> = [
  { pattern: /bash|shell|command|命令|终端/i, capability: 'shell' },
  { pattern: /read|file|读取|查看|文档/i, capability: 'read_file' },
  { pattern: /write|生成文件|输出文件|写入/i, capability: 'write_file' },
  { pattern: /edit|modify|修改|改写/i, capability: 'edit_file' },
  { pattern: /find|glob|locate|搜索文件|找文件/i, capability: 'find_file' },
  { pattern: /search|grep|检索|查找内容|全文搜索/i, capability: 'search_content' },
  { pattern: /sub.?task|agent|delegate|子任务|子代理/i, capability: 'sub_task' },
  { pattern: /fetch|crawl|extract|网页抓取|提取网页/i, capability: 'web_fetch' },
  { pattern: /search web|latest|联网|搜索网页|最新信息/i, capability: 'web_search' },
];

function inferRiskTolerance(text: string): CandidateRiskLevel {
  if (/strict|safe|保守|只读|安全优先|不能写/i.test(text)) return 'low';
  if (/aggressive|powerful|激进|强功能|自动化优先/i.test(text)) return 'high';
  return 'medium';
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function extractKeywords(text: string): string[] {
  return normalizeText(text)
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
}

export function buildTaskRequirement(raw: string): TaskRequirement {
  const normalized = normalizeText(raw);
  const capabilities = new Set<Capability>();

  for (const entry of KEYWORD_CAPABILITY_MAP) {
    if (entry.pattern.test(normalized)) {
      capabilities.add(entry.capability);
    }
  }

  return {
    raw,
    normalized,
    keywords: extractKeywords(normalized),
    capabilities: [...capabilities],
    riskTolerance: inferRiskTolerance(normalized),
    installPreference: /merge|compose|融合|生成新/i.test(normalized)
      ? 'compose'
      : /adapt|tweak|改造|调整/i.test(normalized)
        ? 'adapt'
        : 'existing-only',
  };
}
