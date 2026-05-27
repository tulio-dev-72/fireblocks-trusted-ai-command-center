import type { ReactNode } from "react";
import type { Page } from "../lib/navigation";
import { NAV_ITEMS } from "../lib/navigation";

interface ShellProps {
  page: Page;
  onNavigate: (page: Page) => void;
  dataMode?: string;
  children: ReactNode;
}

export function Shell({ page, onNavigate, dataMode, children }: ShellProps) {
  const sections = [...new Set(NAV_ITEMS.map((i) => i.section))];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">TA</span>
          <div>
            <strong>Trusted AI</strong>
            <span>Command Center</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {sections.map((section) => (
            <div key={section} className="nav-section">
              <span className="nav-section-label">{section}</span>
              {NAV_ITEMS.filter((i) => i.section === section).map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-link ${page === item.id ? "active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {dataMode && (
            <div className={`mode-pill mode-${dataMode}`}>
              {dataMode === "real" ? "Live Sandbox" : dataMode}
            </div>
          )}
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div>
            <h1 className="page-title">
              {NAV_ITEMS.find((i) => i.id === page)?.label ?? "Command Center"}
            </h1>
            <p className="page-subtitle">
              Fireblocks operational intelligence with auditable AI workflows
            </p>
          </div>
          <div className="topbar-meta">
            <span className="meta-chip">Read-only</span>
            <span className="meta-chip">Human approval required</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
