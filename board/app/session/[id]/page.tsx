"use client";

import { useEffect, useState, use as usePromise } from "react";

const AGENT_LABELS: Record<string, string> = {
  chairman: "Chairman of the Board",
  lead_independent: "Lead Independent Director",
  audit: "Audit Committee Chair",
  comp: "Compensation Committee Chair",
  governance: "Nominating & Governance Chair",
  operator: "Been There, Scaled That (Operator)",
  technical: "Technical / Domain Expert",
};

type Turn = {
  id: string;
  round: number;
  agent: string;
  response: string;
  tag: "initial" | "revised" | "clarified" | "held";
  tagReason?: string;
};

type Session = {
  id: string;
  problem: string;
  context?: string;
  summonedAgents: string[];
  stage: string;
  turns: Turn[];
  divergence?: { pattern: string; summary: string };
  gatingQuestion?: string;
  minutes?: {
    boardPosition: string;
    dissent?: string;
    resolvedByOmission: string[];
    openItems: string[];
    heldUnderPressure: string[];
  };
};

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = usePromise(params);
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState("");
  const [targetAgent, setTargetAgent] = useState("chairman");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/sessions/${id}`);
    const data = await res.json();
    if (res.ok) setSession(data.session);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function respond() {
    if (!message.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          targetAgent: session?.stage === "awaiting_founder" ? undefined : targetAgent,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSession(data.session);
        setMessage("");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <div className="wrap">Loading…</div>;

  return (
    <div className="wrap">
      <a href="/" className="sub" style={{ textDecoration: "none" }}>
        ← All sessions
      </a>
      <h1>{session.problem}</h1>
      {session.context && <p className="sub">{session.context}</p>}

      {session.divergence && (
        <p className="system-note">
          Divergence check: {session.divergence.pattern} — {session.divergence.summary}
        </p>
      )}

      {session.turns
        .slice()
        .sort((a, b) => a.round - b.round)
        .map((t) => (
          <div className="card" key={t.id}>
            <span className="agent-name">{AGENT_LABELS[t.agent] ?? t.agent}</span>
            <span className="sub" style={{ marginLeft: 6 }}>
              round {t.round}
            </span>
            {t.tag !== "initial" && (
              <span className={`tag tag-${t.tag}`}>{t.tag}</span>
            )}
            <div className="turn-body">{t.response}</div>
            {t.tagReason && <p className="sub">{t.tagReason}</p>}
          </div>
        ))}

      {session.stage === "awaiting_founder" && (
        <div className="pause-box">
          <strong>The board needs your input before continuing:</strong>
          <p>{session.gatingQuestion}</p>
          <input
            type="text"
            placeholder="Your answer…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div style={{ height: 8 }} />
          <button onClick={respond} disabled={busy || !message.trim()}>
            {busy ? "Board is revising…" : "Answer the board"}
          </button>
        </div>
      )}

      {session.minutes && (
        <div className="minutes">
          <h2>Minutes</h2>
          <div className="card">
            <strong>Board position</strong>
            <div className="turn-body">{session.minutes.boardPosition}</div>
          </div>
          {session.minutes.dissent && (
            <div className="card">
              <strong>Dissent</strong>
              <div className="turn-body">{session.minutes.dissent}</div>
            </div>
          )}
          {session.minutes.resolvedByOmission.length > 0 && (
            <div className="card">
              <strong>Resolved by omission (unresolved, carried forward)</strong>
              <ul>
                {session.minutes.resolvedByOmission.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {session.minutes.openItems.length > 0 && (
            <div className="card">
              <strong>Open forks</strong>
              <ul>
                {session.minutes.openItems.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {session.minutes.heldUnderPressure.length > 0 && (
            <div className="card">
              <strong>Held under pressure</strong>
              <ul>
                {session.minutes.heldUnderPressure.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(session.stage === "done" || session.stage === "round2") && (
          <div className="card">
            <strong>Interrupt / push back</strong>
            <p className="sub">Address a specific board member directly.</p>
            <select
              value={targetAgent}
              onChange={(e) => setTargetAgent(e.target.value)}
              style={{ marginBottom: 8, padding: 6 }}
            >
              {session.summonedAgents.map((a) => (
                <option key={a} value={a}>
                  {AGENT_LABELS[a] ?? a}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Say something to the board…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div style={{ height: 8 }} />
            <button onClick={respond} disabled={busy || !message.trim()}>
              {busy ? "Thinking…" : "Send"}
            </button>
          </div>
        )}
    </div>
  );
}
