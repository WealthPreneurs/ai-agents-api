import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/db";
import { answerGatingQuestion, addFounderInterruption } from "@/lib/orchestrator";
import type { AgentId } from "@/lib/personas";

// Single endpoint for every founder -> board input after intake:
// - If the session is paused on a Type-B gating question, this answers it
//   and the state machine resumes into targeted Round 2 + synthesis.
// - Otherwise, it's a live founder-initiated interruption addressed to one
//   agent (or the Chairman by default) — Rule 1/2 from the interaction
//   protocol design.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const message: string | undefined = body?.message?.trim();
  const targetAgent: AgentId | undefined = body?.targetAgent;

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    if (session.stage === "awaiting_founder") {
      await answerGatingQuestion(session, message);
    } else {
      await addFounderInterruption(session, message, targetAgent);
    }
    await saveSession(session);
    return NextResponse.json({ session });
  } catch (err) {
    console.error("[respond:POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
