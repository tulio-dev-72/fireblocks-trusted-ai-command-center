import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

interface AnalyticsProviderProps {
  children: ReactNode;
}

/** Client-only Vercel analytics — safe to mount in the SPA root. */
export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  return (
    <>
      {children}
      <Analytics />
      <SpeedInsights />
    </>
  );
}
