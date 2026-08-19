import { z } from "zod/v4";
import { SPECIALIST_AGENTS } from "./personas";

// Every stage of the protocol that makes a *decision* (not just generates
// prose) gets a structured-output schema, so the orchestrator branches on
// typed fields instead of parsing freeform text.

export const RoutingSchema = z.object({
  summonedSpecialists: z
    .array(z.enum(SPECIALIST_AGENTS as [string, ...string[]]))
    .describe(
      "Which specialist committee chairs (beyond Chairman + Lead Independent, " +
        "who are always summoned) are relevant to this decision.",
    ),
  reasoning: z.string(),
});

export const Round1TurnSchema = z.object({
  response: z.string().describe("The board member's independent position, in character."),
});

export const RoundNTurnSchema = z.object({
  response: z.string().describe("The board member's response, in character."),
  tag: z.enum(["revised", "clarified", "held"]),
  tagReason: z
    .string()
    .describe("One line: what changed (or didn't) and why this tag applies."),
});

export const DivergencePattern = z.enum([
  "unanimous",
  "incompatible",
  "overlapping_reasoning",
  "unaddressed_framing",
  "gating_dependency",
]);

export const DivergenceSchema = z.object({
  pattern: DivergencePattern,
  agentsInvolved: z
    .array(z.string())
    .describe("Agent ids whose positions are in tension or need to reconcile."),
  summary: z
    .string()
    .describe("One or two sentences: what the divergence actually is."),
  gatingQuestion: z
    .string()
    .optional()
    .describe(
      "Only set when pattern is gating_dependency: the single consolidated " +
        "question to put to the founder before Round 2 can proceed.",
    ),
});

export const SynthesisSchema = z.object({
  boardPosition: z
    .string()
    .describe("The resolved majority recommendation, with reasoning."),
  dissent: z
    .string()
    .optional()
    .describe("Named dissent from the majority, if any."),
  resolvedByOmission: z
    .array(z.string())
    .describe(
      "Structural/framing questions raised during the session that were " +
        "never actually answered, even though the board converged tactically.",
    ),
  openItems: z
    .array(z.string())
    .describe("Genuinely unresolved forks — no majority, presented as a real either/or."),
  heldUnderPressure: z
    .array(z.string())
    .describe(
      "Short notes on where an agent held its position under founder pushback " +
        "(pulled from turns tagged 'held') — the strongest evidence of independence.",
    ),
});

export type RoutingResult = z.infer<typeof RoutingSchema>;
export type Round1Turn = z.infer<typeof Round1TurnSchema>;
export type RoundNTurn = z.infer<typeof RoundNTurnSchema>;
export type DivergenceResult = z.infer<typeof DivergenceSchema>;
export type SynthesisResult = z.infer<typeof SynthesisSchema>;
