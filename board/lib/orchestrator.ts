import { randomUUID } from "crypto";
import { structuredCall } from "./anthropic";
import {
  ALWAYS_SUMMONED,
  AGENT_LABELS,
  PERSONA_PROMPTS,
  type AgentId,
} from "./personas";
import {
  RoutingSchema,
  Round1TurnSchema,
  RoundNTurnSchema,
  DivergenceSchema,
  SynthesisSchema,
} from "./schemas";
import {
  addOpenItems,
  saveSession,
  type Session,
  type Turn,
} from "./db";

function newTurn(partial: Omit<Turn, "id" | "createdAt">): Turn {
  return { ...partial, id: randomUUID(), createdAt: new Date().toISOString() };
}

function intakeBlock(session: Pick<Session, "problem" | "context">): string {
  return `DECISION BROUGHT TO THE BOARD:\n${session.problem}${
    session.context ? `\n\nADDITIONAL CONTEXT:\n${session.context}` : ""
  }`;
}

// --- Stage 0: routing -------------------------------------------------

async function routeSpecialists(problem: string, context?: string): Promise<AgentId[]> {
  const result = await structuredCall({
    system: PERSONA_PROMPTS.chairman,
    schema: RoutingSchema,
    schemaName: "routing",
    userContent: `As Chairman, decide which specialist committee chairs should be
summoned for this decision (Chairman and Lead Independent Director are always
summoned separately — do not include them). Be generous rather than stingy:
include a specialist if their domain is plausibly touched, even if you're not
certain.

${intakeBlock({ problem, context })}`,
  });
  return result.summonedSpecialists as AgentId[];
}

// --- Stage 1: Round 1, independent -------------------------------------

async function runRound1(
  problem: string,
  context: string | undefined,
  agents: AgentId[],
): Promise<Turn[]> {
  const calls = agents.map(async (agent) => {
    const result = await structuredCall({
      system: PERSONA_PROMPTS[agent],
      schema: Round1TurnSchema,
      schemaName: "round1_turn",
      userContent: `A decision has been brought to the board. Give your
independent position — you have not seen and should not assume anything
about what any other board member thinks.

${intakeBlock({ problem, context })}`,
    });
    return newTurn({ round: 1, agent, response: result.response, tag: "initial" });
  });
  return Promise.all(calls);
}

// --- Stage 2: divergence check ------------------------------------------

function transcriptBlock(turns: Turn[]): string {
  return turns
    .map((t) => `${AGENT_LABELS[t.agent]}:\n${t.response}`)
    .join("\n\n---\n\n");
}

async function checkDivergence(
  problem: string,
  context: string | undefined,
  round1: Turn[],
) {
  return structuredCall({
    system: PERSONA_PROMPTS.chairman,
    schema: DivergenceSchema,
    schemaName: "divergence",
    userContent: `As Chairman, classify the board's Round 1 positions on this
decision. Choose exactly one pattern:
- "unanimous": genuine agreement, compatible reasoning, nothing to reconcile.
- "incompatible": two or more agents recommend actually incompatible actions.
- "overlapping_reasoning": agents land on the same/similar recommendation via
  visibly different reasoning that hasn't been reconciled.
- "unaddressed_framing": a structural/strategic question (usually from you or
  the Lead Independent Director) that other agents did not engage with at all.
- "gating_dependency": one agent's open question is a prerequisite other
  agents' reasoning structurally depends on, AND the answer is founder-only
  information the board can't infer — in which case set gatingQuestion to a
  single, clear, consolidated question for the founder.

${intakeBlock({ problem, context })}

ROUND 1 POSITIONS:
${transcriptBlock(round1)}`,
    maxTokens: 1024,
  });
}

// --- Stage 3: targeted Round 2 ------------------------------------------

async function runRoundN(
  round: 2 | 3,
  problem: string,
  context: string | undefined,
  priorTurns: Turn[],
  agents: AgentId[],
  extraContext: string,
): Promise<Turn[]> {
  const calls = agents.map(async (agent) => {
    const result = await structuredCall({
      system: PERSONA_PROMPTS[agent],
      schema: RoundNTurnSchema,
      schemaName: "round_n_turn",
      userContent: `${intakeBlock({ problem, context })}

FULL BOARD DISCUSSION SO FAR:
${transcriptBlock(priorTurns)}

${extraContext}

Respond in character. Engage directly with what other agents said if
relevant. Tag your response per your instructions (revised / clarified /
held).`,
    });
    return newTurn({
      round,
      agent,
      response: result.response,
      tag: result.tag,
      tagReason: result.tagReason,
    });
  });
  return Promise.all(calls);
}

// --- Stage 4: synthesis ---------------------------------------------------

async function synthesize(
  problem: string,
  context: string | undefined,
  allTurns: Turn[],
) {
  return structuredCall({
    system: PERSONA_PROMPTS.chairman,
    schema: SynthesisSchema,
    schemaName: "synthesis",
    userContent: `As Chairman, close this session. Produce the board's
synthesis. Bucket carefully:
- boardPosition: the resolved recommendation, with reasoning.
- dissent: named dissent from the majority, if any (omit if none).
- resolvedByOmission: framing/strategic questions raised (often by you or the
  Lead Independent Director) that were never actually answered, even though
  the board converged tactically. Do not silently drop these.
- openItems: genuinely unresolved forks with no majority — state as a real
  either/or, don't manufacture a resolution.
- heldUnderPressure: pull from any turn tagged "held" — this is the board's
  strongest evidence that it pushed back rather than deferred, surface it.

${intakeBlock({ problem, context })}

FULL BOARD DISCUSSION:
${transcriptBlock(allTurns)}`,
    maxTokens: 2048,
  });
}

// --- Orchestration entry points ------------------------------------------

export async function createAndRunSession(
  problem: string,
  context?: string,
): Promise<Session> {
  const specialists = await routeSpecialists(problem, context);
  const summonedAgents = [...ALWAYS_SUMMONED, ...specialists];

  const round1 = await runRound1(problem, context, summonedAgents);

  const session: Session = {
    id: randomUUID(),
    problem,
    context,
    summonedAgents,
    stage: "round1",
    turns: round1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const divergence = await checkDivergence(problem, context, round1);
  session.divergence = divergence;

  await advanceAfterDivergence(session, divergence);
  return session;
}

async function advanceAfterDivergence(
  session: Session,
  divergence: Awaited<ReturnType<typeof checkDivergence>>,
): Promise<void> {
  if (divergence.pattern === "unanimous") {
    session.stage = "synthesis";
    const minutes = await synthesize(session.problem, session.context, session.turns);
    session.minutes = minutes;
    session.stage = "done";
    await addOpenItems(session.id, session.problem, [
      ...minutes.resolvedByOmission,
      ...minutes.openItems,
    ]);
    await saveSession(session);
    return;
  }

  if (divergence.pattern === "gating_dependency" && divergence.gatingQuestion) {
    session.stage = "awaiting_founder";
    session.gatingQuestion = divergence.gatingQuestion;
    await saveSession(session);
    return;
  }

  // incompatible | overlapping_reasoning | unaddressed_framing -> targeted Round 2
  const involved =
    divergence.pattern === "incompatible"
      ? session.summonedAgents
      : ((divergence.agentsInvolved as AgentId[]).filter((a) =>
          session.summonedAgents.includes(a),
        ) || session.summonedAgents);

  const round2 = await runRoundN(
    2,
    session.problem,
    session.context,
    session.turns,
    involved.length ? involved : session.summonedAgents,
    `DIVERGENCE THE CHAIRMAN FLAGGED: ${divergence.summary}`,
  );
  session.turns = [...session.turns, ...round2];
  session.stage = "synthesis";

  const minutes = await synthesize(session.problem, session.context, session.turns);
  session.minutes = minutes;
  session.stage = "done";
  await addOpenItems(session.id, session.problem, [
    ...minutes.resolvedByOmission,
    ...minutes.openItems,
  ]);
  await saveSession(session);
}

/** Founder answers a Type-B gating question raised at intake (awaiting_founder stage). */
export async function answerGatingQuestion(
  session: Session,
  founderAnswer: string,
): Promise<void> {
  if (session.stage !== "awaiting_founder" || !session.divergence) {
    throw new Error("Session is not awaiting a gating answer");
  }
  const involved = (session.divergence.agentsInvolved as AgentId[]).filter((a) =>
    session.summonedAgents.includes(a),
  );

  const round2 = await runRoundN(
    2,
    session.problem,
    session.context,
    session.turns,
    involved.length ? involved : session.summonedAgents,
    `THE FOUNDER'S ANSWER TO THE BOARD'S GATING QUESTION ("${session.gatingQuestion}"):\n${founderAnswer}\n\nRevise your position if this changes it; otherwise hold.`,
  );
  session.turns = [...session.turns, ...round2];
  session.stage = "synthesis";

  const minutes = await synthesize(session.problem, session.context, session.turns);
  session.minutes = minutes;
  session.stage = "done";
  await addOpenItems(session.id, session.problem, [
    ...minutes.resolvedByOmission,
    ...minutes.openItems,
  ]);
  await saveSession(session);
}

/**
 * Founder-initiated interruption at Round 2+/done. Routes to one named agent
 * (or the Chairman by default) per Rule 1 in the interaction-protocol design:
 * Round 1 stays protected and is never interrupted directly.
 */
export async function addFounderInterruption(
  session: Session,
  message: string,
  targetAgent?: AgentId,
): Promise<Turn> {
  if (session.stage === "round1") {
    throw new Error(
      "Cannot interrupt during Round 1 — independence is protected until it completes",
    );
  }
  const agent = targetAgent ?? "chairman";
  const lastRound = session.turns[session.turns.length - 1]?.round ?? 1;
  // Interruptions only happen after Round 1 completes, so this is always 2 or 3.
  const nextRound = Math.min(Math.max(lastRound + 1, 2), 3) as 2 | 3;

  const [turn] = await runRoundN(
    nextRound,
    session.problem,
    session.context,
    session.turns,
    [agent],
    `FOUNDER INTERRUPTION, ADDRESSED TO YOU DIRECTLY:\n"${message}"`,
  );
  session.turns = [...session.turns, turn];
  await saveSession(session);
  return turn;
}
