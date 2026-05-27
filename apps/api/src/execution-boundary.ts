/** Routes that perform or simulate Fireblocks transaction execution — disabled platform-wide. */
const DISABLED_EXECUTION_PATHS = new Set([
  "/v1/transactions/draft",
  "/v1/transactions/submit",
  "/v1/transactions/sign",
  "/v1/approvals/execute",
  "/v1/approvals/decide",
]);

export function isDisabledExecutionRoute(method: string, path: string): boolean {
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") {
    return false;
  }
  if (DISABLED_EXECUTION_PATHS.has(path)) return true;
  if (path.match(/^\/v1\/transactions\/[^/]+\/(sign|submit|approve)/)) return true;
  if (path.match(/^\/v1\/approvals\/[^/]+\/(approve|reject|execute)/)) return true;
  return false;
}

export const EXECUTION_DISABLED_MESSAGE =
  "Transaction execution, signing, and approval actions are disabled. This platform is read-only.";
