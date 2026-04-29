/**
 * Timeout Wrapper
 * 
 * Wraps promises with timeouts to prevent indefinite hanging.
 */

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Operation "${operationName}" timed out after ${timeoutMs}ms`
            )
          ),
        timeoutMs
      )
    ),
  ]);
}

export const SAFE_TIMEOUTS = {
  sessionWrite: 5000, // Session file writes
  modelInference: 120000, // LLM calls
  toolExecution: 60000, // Tool calls
  fileOperation: 10000, // File I/O
  networkRequest: 30000, // HTTP requests
  pluginCall: 30000, // Plugin execution
};
