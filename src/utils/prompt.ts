/** Ask the user to confirm an interactive action. */
export async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }

  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(message, resolve);
  });
  rl.close();

  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}
