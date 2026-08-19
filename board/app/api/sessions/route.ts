import { NextRequest, NextResponse } from "next/server";
import { createAndRunSession } from "@/lib/orchestrator";
import { listSessions } from "@/lib/db";

export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const problem = body?.problem?.trim();
  if (!problem) {
    return NextResponse.json({ error: "problem is required" }, { status: 400 });
  }
  const context = body?.context?.trim() || undefined;

  try {
    const session = await createAndRunSession(problem, context);
    return NextResponse.json({ session });
  } catch (err) {
    console.error("[sessions:POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
