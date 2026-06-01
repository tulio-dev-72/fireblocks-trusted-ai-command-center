import { OPERATIONAL_INVESTIGATION_PROMPTS, PROMPT_HINTS } from "../lib/investigation-prompts";
import { InfoHint } from "./InfoHint";

interface InvestigationPromptCardsProps {
  onSelectPrompt: (prompt: string) => void;
}

export function InvestigationPromptCards({ onSelectPrompt }: InvestigationPromptCardsProps) {
  return (
    <section className="panel investigation-prompts-panel">
      <span className="section-eyebrow">Operational Investigations</span>
      <h2>Evidence-backed investigation prompts</h2>
      <p className="panel-desc">
        Run evidence-backed investigations across settlements, approvals, liquidity, and policy
        enforcement using live Fireblocks operational data.
      </p>
      <div className="prompt-card-grid">
        {OPERATIONAL_INVESTIGATION_PROMPTS.map((prompt) => (
          <div key={prompt} className="prompt-card-wrap">
            <button
              type="button"
              className="prompt-card"
              onClick={() => onSelectPrompt(prompt)}
            >
              <span className="prompt-card-label">{prompt}</span>
              <span className="prompt-card-action">Run investigation</span>
            </button>
            <span className="prompt-card-info">
              <InfoHint title="What this investigates" align="left">
                {PROMPT_HINTS[prompt]}
              </InfoHint>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
