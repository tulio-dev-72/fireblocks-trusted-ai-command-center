import { useState } from "react";
import type { EvidenceCard } from "@taicc/shared-types";
import { trackProductEvent } from "../lib/analytics";
import { ProvenanceBadge } from "./ProvenanceBadge";

interface Props {
  card: EvidenceCard;
}

export function ExpandableEvidenceCard({ card }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`evidence-card evidence-card-expandable ${open ? "expanded" : ""}`}>
      <button
        type="button"
        className="evidence-card-toggle"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            trackProductEvent("evidence_card_opened", {
              page: "investigator",
              evidence_type: card.reason ?? "general",
              workflow_type: "delayed_payments",
            });
          }
        }}
      >
        <div className="evidence-card-top">
          <span className="reason-tag">{card.title}</span>
          <ProvenanceBadge provenance={card.provenance} compact />
        </div>
        <p className="evidence-card-sub">{card.subtitle}</p>
        <span className="evidence-card-expand-hint">{open ? "Hide details" : "Show traceable evidence"}</span>
      </button>
      {open && (
        <dl className="evidence-card-trace-dl">
          {card.transaction_id && (
            <>
              <dt>Transaction ID</dt>
              <dd className="mono">{card.transaction_id}</dd>
            </>
          )}
          {card.vault_id && (
            <>
              <dt>Vault ID</dt>
              <dd className="mono">{card.vault_id}</dd>
            </>
          )}
          {card.source_vault_id && card.source_vault_id !== card.vault_id && (
            <>
              <dt>Source vault</dt>
              <dd className="mono">{card.source_vault_id}</dd>
            </>
          )}
          {card.destination_id && (
            <>
              <dt>Destination</dt>
              <dd className="mono">{card.destination_id}</dd>
            </>
          )}
          {card.status && (
            <>
              <dt>Status</dt>
              <dd>{card.status}</dd>
            </>
          )}
          {card.approval_state && (
            <>
              <dt>Approval state</dt>
              <dd>{card.approval_state}</dd>
            </>
          )}
          {card.policy_reference && (
            <>
              <dt>Policy reference</dt>
              <dd className="mono">{card.policy_reference}</dd>
            </>
          )}
          {card.timestamp && (
            <>
              <dt>Timestamp</dt>
              <dd>{new Date(card.timestamp).toLocaleString()}</dd>
            </>
          )}
          {card.amount && (
            <>
              <dt>Amount</dt>
              <dd>
                {card.amount} {card.asset}
              </dd>
            </>
          )}
          <dt>Evidence ID</dt>
          <dd className="mono">{card.evidence_id}</dd>
          {card.details && Object.keys(card.details).length > 0 && (
            <>
              <dt>Retrieved fields</dt>
              <dd>
                <pre className="audit-meta">{JSON.stringify(card.details, null, 2)}</pre>
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
