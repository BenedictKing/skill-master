import chalk from 'chalk';

const PREFIX = chalk.blue('skill-master');
const DEFAULT_TABLE_WIDTH = 24;

function formatTableCell(value: string, width: number): string {
  if (value.length > width) {
    return value.slice(0, width - 3) + '...';
  }
  return value.padEnd(width);
}

function formatTable(cols: string[], widths?: number[]): string {
  return cols
    .map((col, index) => formatTableCell(col, widths?.[index] ?? DEFAULT_TABLE_WIDTH))
    .join('  ');
}

/** Informational message */
export function info(msg: string): void {
  console.log(`${PREFIX} ${chalk.cyan('info')} ${msg}`);
}

/** Success message */
export function success(msg: string): void {
  console.log(`${PREFIX} ${chalk.green('✔')} ${msg}`);
}

/** Warning message */
export function warn(msg: string): void {
  console.log(`${PREFIX} ${chalk.yellow('⚠')} ${msg}`);
}

/** Error message */
export function error(msg: string): void {
  console.error(`${PREFIX} ${chalk.red('✖')} ${msg}`);
}

/** Debug message (only when DEBUG env is set) */
export function debug(msg: string): void {
  if (process.env.DEBUG) {
    console.log(`${PREFIX} ${chalk.gray('debug')} ${msg}`);
  }
}

/** Step indicator with number */
export function step(num: number, total: number, msg: string): void {
  const counter = chalk.gray(`[${num}/${total}]`);
  console.log(`${PREFIX} ${counter} ${msg}`);
}

/** Print a blank line */
export function blank(): void {
  console.log();
}

/** Print a section header (for grouping) */
export function section(title: string): void {
  console.log(chalk.bold(title));
}

/** Print a key-value pair */
export function kv(key: string, value: string): void {
  console.log(`  ${chalk.gray(key + ':')} ${value}`);
}

/** Print a table header */
export function tableHeader(...cols: string[]): void {
  const formatted = formatTable(cols);
  console.log(chalk.bold(formatted));
  console.log(chalk.gray('─'.repeat(formatted.length)));
}

/** Print a table row */
export function tableRow(...cols: string[]): void {
  console.log(formatTable(cols));
}

/** Print a table header with custom widths */
export function tableHeaderWithWidths(widths: number[], ...cols: string[]): void {
  const formatted = formatTable(cols, widths);
  console.log(chalk.bold(formatted));
  console.log(chalk.gray('─'.repeat(formatted.length)));
}

/** Print a table row with custom widths */
export function tableRowWithWidths(widths: number[], ...cols: string[]): void {
  console.log(formatTable(cols, widths));
}
