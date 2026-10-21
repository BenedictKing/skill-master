/**
 * 终端转义注入防御（CWE-150）。
 *
 * SKILL.md frontmatter、注册表/搜索 API 返回值等不可信字符串若含 ANSI CSI、
 * OSC（可改终端标题、伪造超链接）、其他 ESC 序列或 C0/C1 控制字符，直接打印
 * 会被用来伪造输出、隐藏内容或劫持终端。所有人类可读输出在 logger 边界统一剥离。
 * 保留 \n 与 \t 以维持多行/对齐格式。
 */
const TERMINAL_ESCAPES = new RegExp(
  [
    // CSI: ESC [ 参数 中间字节 终止字节（含 SGR 颜色、光标移动、清屏）
    '\\x1b\\[[0-?]*[ -/]*[@-~]',
    // OSC: ESC ] ... BEL 或 ESC \（终端标题、超链接等）
    '\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)?',
    // 其他两字节 ESC 序列（ESC c 重置等）与孤立 ESC
    '\\x1b[@-Z\\\\-_]?',
    // C0 控制字符（保留 \\t \\n）、DEL、C1 控制字符
    '[\\x00-\\x08\\x0b-\\x1f\\x7f\\x80-\\x9f]',
  ].join('|'),
  'g',
);

/** 剥离终端控制序列与控制字符，保留 \n 与 \t */
export function stripTerminalEscapes(input: string): string {
  return input.replace(TERMINAL_ESCAPES, '');
}
