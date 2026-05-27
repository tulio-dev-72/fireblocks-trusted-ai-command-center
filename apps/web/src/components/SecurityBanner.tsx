/** Public deployment security notice — always visible in production UI. */
export function SecurityBanner() {
  return (
    <div className="security-banner" role="status">
      <strong>Sandbox environment.</strong> Read-only. No transaction execution.
    </div>
  );
}
