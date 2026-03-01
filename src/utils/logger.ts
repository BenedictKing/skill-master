import chalk from 'chalk';

const PREFIX = chalk.blue('skill-master');

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
  console.log(chalk.bold(cols.map(c => c.padEnd(20)).join('')));
  console.log(chalk.gray('─'.repeat(cols.length * 20)));
}

/** Print a table row */
export function tableRow(...cols: string[]): void {
  console.log(cols.map(c => c.padEnd(20)).join(''));
}
