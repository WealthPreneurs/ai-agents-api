"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SessionSummary = {
  id: string;
  problem: string;
  stage: string;
  createdAt: string;
};

export default function HomePage() {
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => {});
  }, []);

  async function submit() {
    if (!problem.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, context: context || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create session");
      router.push(`/session/${data.session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <h1>Board of Directors</h1>
      <p className="sub">Bring the board a decision. It runs independently first.</p>

      <textarea
        rows={3}
        placeholder="What's the decision or problem?"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
      />
      <div style={{ height: 10 }} />
      <textarea
        rows={2}
        placeholder="Optional context (numbers, timeline, prior decisions)"
        value={context}
        onChange={(e) => setContext(e.target.value)}
      />
      <div style={{ height: 12 }} />
      <button onClick={submit} disabled={loading || !problem.trim()}>
        {loading ? "Convening the board…" : "Bring to the board"}
      </button>
      {error && <p style={{ color: "#a4302a" }}>{error}</p>}

      <h2>Past sessions</h2>
      {sessions.length === 0 && <p className="sub">No sessions yet.</p>}
      {sessions.map((s) => (
        <a key={s.id} className="session-row" href={`/session/${s.id}`}>
          <div className="stage">{s.stage}</div>
          <div>{s.problem}</div>
        </a>
      ))}
    </div>
  );
}
