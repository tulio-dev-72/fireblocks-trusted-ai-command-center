import type { ReactNode } from "react";

interface InfoHintProps {
  title: string;
  children: ReactNode;
  /** Tooltip placement relative to the icon. Defaults to "top". */
  align?: "top" | "left" | "right";
}

/**
 * Small "i" icon that reveals a stylized definition tooltip on hover/focus.
 * Reusable across tiles and cards. Keyboard-accessible (focusable trigger,
 * tooltip shown via :focus-within).
 */
export function InfoHint({ title, children, align = "top" }: InfoHintProps) {
  return (
    <span className={`info-hint info-hint-${align}`}>
      <button type="button" className="info-hint-trigger" aria-label={`What is ${title}?`}>
        <svg viewBox="0 0 16 16" aria-hidden="true" className="info-hint-icon">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
          <path d="M8 7.1v4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <span className="info-hint-bubble" role="tooltip">
        <strong className="info-hint-title">{title}</strong>
        <span className="info-hint-body">{children}</span>
      </span>
    </span>
  );
}
