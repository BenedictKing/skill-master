/**
 * 临时静默 console 输出，供 `--json` 模式包裹会打印人类可读日志的子流程，
 * 保证 stdout 只有最终 JSON。
 */
export function silenceConsole(): () => void {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  return () => {
    console.log = originalLog;
    console.error = originalError;
  };
}

export async function runSilenced<T>(fn: () => Promise<T>): Promise<T> {
  const restore = silenceConsole();
  try {
    return await fn();
  } finally {
    restore();
  }
}
