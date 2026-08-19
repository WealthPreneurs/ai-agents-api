# Board of Directors

A multi-agent AI advisory board scaffold — 7 personas (Chairman, Lead
Independent Director, Audit/Comp/Governance committee chairs, an
operator, and a technical expert) that debate a decision brought to them,
rather than just each giving a separate opinion.

This implements the protocol designed and hand-stress-tested in the
accompanying design conversation: independent Round 1 → structured
divergence-check → targeted Round 2 (or a pause for founder input, or a
skip straight to synthesis) → bucketed synthesis (resolved / resolved-by-
omission / open), with founder-initiated interruption and explicit
revised/clarified/held tagging so the board's independence is visible, not
just claimed.

## Run it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open `http://localhost:3000`.

## How it maps to the design

| Design piece | Where it lives |
|---|---|
| Persona system prompts | `lib/personas.ts` |
| Structured-output contracts (divergence pattern, tags, synthesis buckets) | `lib/schemas.ts` |
| The state machine itself | `lib/orchestrator.ts` |
| Claude API call wrapper (`messages.parse` + Zod, adaptive thinking) | `lib/anthropic.ts` |
| Sessions / turns / open-items persistence | `lib/db.ts` |
| Intake + session list | `app/page.tsx` |
| Live transcript, pause box, interruption box, minutes | `app/session/[id]/page.tsx` |

## Deliberate simplifications vs. the target architecture

- **Persistence is a JSON file (`data/sessions.json`), not Postgres.** Zero
  setup, easy to inspect while you're still validating the protocol. Swap
  `lib/db.ts` for real queries once you trust the design — the `Session`/
  `Turn`/`OpenItem` shapes are already close to the target schema
  (`sessions` / `turns` / `minutes` / `open_items`).
- **No SSE streaming yet.** The UI calls the API, waits for the full
  round to resolve, and re-renders — not the live token-by-token feel
  discussed for the transcript view. The state machine doesn't care either
  way; streaming is a rendering concern to add later (stream Round 1's N
  parallel calls as each resolves).
- **Round budget is soft, not enforced.** `addFounderInterruption` bumps
  the round counter but doesn't hard-stop repeated interruptions the way
  the design's "revision consumes a round" rule intends — the personas'
  own HELD-tag instruction is currently the only thing discouraging an
  infinite pushback loop. Worth hardening once you see real usage.
- **Chairman-as-classifier is trusted, not checked.** The design flagged
  giving the Lead Independent Director standing power to force a Round 2
  the Chairman skipped. Not implemented — the Chairman's divergence
  classification is currently final.
- **All specialist agents run every round they're summoned for.** There's
  no per-agent early-exit ("not my domain, deferring") wired as a distinct
  UI state yet, even though the persona prompts instruct agents to say so
  briefly when it applies — it just shows up as a short response today.

## Cost note

A full session (routing + Round 1 across up to 7 agents + divergence
check + targeted Round 2 + synthesis) is roughly 10-12 Claude Opus 5
calls. Nothing here downgrades model/effort for cost — that's a call to
make deliberately later (e.g. dropping to Sonnet for routing/tagging
calls) once you know the protocol holds up in real use.
