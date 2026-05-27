/** Subtle deployment context — not a compliance gate. */
export function SecurityBanner() {
  return (
    <div className="security-banner security-banner-subtle" role="status">
      Sandbox · read-only operational intelligence
    </div>
  );
}
