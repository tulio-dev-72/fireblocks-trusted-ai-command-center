import type { EvidenceGraphEdge, EvidenceGraphNode } from "@taicc/shared-types";

const KIND_COLORS: Record<EvidenceGraphNode["kind"], string> = {
  transaction: "#3b82f6",
  vault: "#10b981",
  approval: "#f59e0b",
  webhook: "#8b5cf6",
  policy: "#ef4444",
  finding: "#06b6d4",
};

interface Props {
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
}

export function EvidenceGraphView({ nodes, edges }: Props) {
  if (nodes.length === 0) {
    return (
      <p className="empty graph-empty">
        No evidence relationships to graph — retrieve Fireblocks records to populate the evidence graph.
      </p>
    );
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="evidence-graph">
      <div className="evidence-graph-nodes">
        {nodes.map((node) => (
          <div key={node.id} className={`graph-node graph-node-${node.kind}`}>
            <span
              className="graph-node-dot"
              style={{ background: KIND_COLORS[node.kind] }}
              aria-hidden
            />
            <div>
              <strong>{node.label}</strong>
              <span className="graph-node-kind">{node.kind}</span>
              {node.ref_id && <span className="mono graph-node-ref">{node.ref_id.slice(0, 16)}</span>}
            </div>
          </div>
        ))}
      </div>
      {edges.length > 0 && (
        <div className="evidence-graph-edges">
          <h5>Relationships (retrieved evidence only)</h5>
          <ul>
            {edges.slice(0, 24).map((edge, i) => {
              const from = nodeMap.get(edge.from)?.label ?? edge.from;
              const to = nodeMap.get(edge.to)?.label ?? edge.to;
              return (
                <li key={i}>
                  <span className="mono">{from}</span>
                  <span className="graph-edge-relation">{edge.relation}</span>
                  <span className="mono">{to}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
