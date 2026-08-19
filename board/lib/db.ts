import { promises as fs } from "fs";
import path from "path";
import type { AgentId } from "./personas";
import type { DivergenceResult, SynthesisResult } from "./schemas";

// Simplification vs. the target architecture: the spec calls for Postgres
// (sessions / turns / minutes / open_items tables). For a local scaffold
// this is a single JSON file — zero setup, easy to inspect, trivial to swap
// for a real DB once the protocol itself has been used enough to trust.
// Not safe for concurrent writers; fine for solo local use.

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "sessions.json");

export type Stage =
  | "round1"
  | "awaiting_founder"
  | "round2"
  | "synthesis"
  | "done";

export type Turn = {
  id: string;
  round: 1 | 2 | 3;
  agent: AgentId;
  response: string;
  tag: "initial" | "revised" | "clarified" | "held";
  tagReason?: string;
  createdAt: string;
};

export type Session = {
  id: string;
  problem: string;
  context?: string;
  summonedAgents: AgentId[];
  stage: Stage;
  turns: Turn[];
  divergence?: DivergenceResult;
  gatingQuestion?: string;
  minutes?: SynthesisResult;
  createdAt: string;
  updatedAt: string;
};

type Store = { sessions: Session[]; openItems: OpenItem[] };

export type OpenItem = {
  id: string;
  sessionId: string;
  topic: string;
  description: string;
  resolved: boolean;
};

async function ensureStore(): Promise<Store> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Store;
  } catch {
    const empty: Store = { sessions: [], openItems: [] };
    await fs.writeFile(DATA_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

export async function listSessions(): Promise<Session[]> {
  const store = await ensureStore();
  return [...store.sessions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getSession(id: string): Promise<Session | undefined> {
  const store = await ensureStore();
  return store.sessions.find((s) => s.id === id);
}

export async function saveSession(session: Session): Promise<void> {
  const store = await ensureStore();
  const idx = store.sessions.findIndex((s) => s.id === session.id);
  session.updatedAt = new Date().toISOString();
  if (idx === -1) store.sessions.push(session);
  else store.sessions[idx] = session;
  await writeStore(store);
}

export async function listOpenItems(): Promise<OpenItem[]> {
  const store = await ensureStore();
  return store.openItems.filter((i) => !i.resolved);
}

export async function addOpenItems(
  sessionId: string,
  topic: string,
  items: string[],
): Promise<void> {
  if (items.length === 0) return;
  const store = await ensureStore();
  for (const description of items) {
    store.openItems.push({
      id: crypto.randomUUID(),
      sessionId,
      topic,
      description,
      resolved: false,
    });
  }
  await writeStore(store);
}
