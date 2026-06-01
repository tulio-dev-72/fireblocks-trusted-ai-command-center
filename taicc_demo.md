# TAICC — Demo Runbook

**App:** Trusted AI Command Center
**Live URL:** https://fireblocks-trusted-ai-command-cente.vercel.app/
**Architecture:** Web (Vite SPA) on Vercel · API on Render · Postgres audit log · Anthropic Claude (optional, with deterministic fallback) · Fireblocks **sandbox** via RS256 JWT.

---

## One-line pitch

> "It's an operational-intelligence layer **on top of** Fireblocks. Fireblocks stays the custody, signing, and governance authority — this app does read-only investigation and AI reasoning over live Fireblocks sandbox data, with every step audited and no execution from the platform."

---

## Pre-flight (do this ~10 min before)

- [ ] **Warm the backend.** The API runs on Render's starter plan and **sleeps when idle** — first request can take 30–60s. Open the site, load Treasury Operations, and **run one investigation** before the demo so it's warm and the audit log already has data.
- [ ] **Confirm "real" signals:**
  - Home shows the **"Real Fireblocks sandbox data — live API"** banner.
  - Trust Center shows **Model Provider: anthropic / claude-sonnet-4**. If it says `grounded_synthesis` / "Local synthesis", the Anthropic key isn't loading (still fine — see fallback note).
- [ ] **Have two tabs ready:** the app, and the GitHub repo (in case they ask to see code).

---

## Suggested flow (7–8 min)

1. **Treasury Operations (home).** Point at the live-data banner. Walk the three stat tiles — **hover the info icons** to show the funnel: *Non-final → Delayed/blocked (genuinely stuck) → Pending authorization*. Then the charts (hover a couple of the new chart-title icons). Message: "all aggregated from live `/v1/transactions`, `/v1/balances`, `/v1/approvals`."

2. **Delayed Payments investigator.** Pick a mode — **hover the mode info icon** to show the analyst lens. Hover a **prompt-card icon** to show what it investigates. Click **"Why are these treasury payments delayed?" → Start.**

3. **Workspace (the money shot).** Narrate the **Orchestration Timeline** ("streamed from the append-only audit log"), then the **Assessment** — hover the **provenance icon** ("AI-derived but grounded only in real Fireblocks evidence; the model never invents transactions"). In the context panel, **hover Confidence / Model / RBAC enforced / Prompt logged.** End on **"Prepare Escalation Summary"** → "draft only, human approval stays in Fireblocks."

4. **Trust Center.** The **"How AI uses your data"** explainer answers the data-governance question directly. Show the provider data-use links.

5. **Audit Log** (optional). Same correlation ID ties every step together.

---

## Likely questions → crisp answers

- **"Is this real or mocked?"** → Live Fireblocks **sandbox** via RS256 JWT signing; real Postgres audit log; real Anthropic Claude. Web on Vercel, API on Render. Sandbox = testnet, not prod custody.
- **"Is Fireblocks data sent to the LLM?"** → Yes — *summarized, citation-tagged excerpts* (~180 chars each), not full payloads. Read-only, audited, RBAC-gated. Anthropic's commercial terms = no training on API data.
- **"How do you prevent hallucination?"** → Counts/verdicts are computed deterministically from the evidence; the model only writes the narrative. System prompt forbids fabricating IDs/amounts/statuses; every claim cites an evidence ID.
- **"Why does it say 29 delayed?"** → Those are non-terminal sandbox transactions. The headline "Delayed/blocked" now counts only genuinely stuck ones (pending approval/policy/failed), excluding normal confirming.
- **"What do the modes change?"** → The analyst lens (LLM system prompt) and recommended action — same underlying evidence, different framing.
- **"Can it move money?"** → No. Read-only by design; no signing/approval from the platform. Execution stays in Fireblocks with human sign-off.

---

## If something breaks

- **Blank / loading, or "Malformed JWT" errors** → backend cold or the platform token; give it 30–60s and reload. The **FB Auth Diagnostics** page (under Infrastructure) shows exactly what's failing.
- **Charts empty / tiles show "—"** → API still waking; reload.
- **Model shows "Local synthesis"** → Anthropic key not loaded on Render; the app still works (deterministic synthesis), just say "external model is optional and falls back to local synthesis."

---

## Glossary (for tough questions)

- **Provenance tags:** `REAL_FIREBLOCKS_SANDBOX` = retrieved from the live sandbox API. `DERIVED_AI` = produced by the model (narrative only, grounded in the above).
- **RBAC enforced:** role-based access filtered the evidence before it reached the model and gated the workflow.
- **Prompt logged:** the exact AI prompt for the run was written to the append-only audit log for traceability.
- **Confidence (HIGH/MEDIUM/LOW):** the model's stated confidence given evidence completeness — not a guarantee.
