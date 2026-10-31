/**
 * Upstream clients: the AI Agents API (the Express app in the repo root) and
 * the Supabase project the dashboard uses for login and saved deals.
 *
 * The Deal Engine and billing endpoints need a logged-in dashboard user. Set
 * DEAL_ENGINE_EMAIL and DEAL_ENGINE_PASSWORD (with SUPABASE_URL and
 * SUPABASE_ANON_KEY) and the server signs in and refreshes the session itself,
 * or pass a short-lived session token in AI_AGENTS_ACCESS_TOKEN.
 */

export const API_BASE_URL = (process.env.AI_AGENTS_API_URL || "http://localhost:3000").replace(/\/$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const EMAIL = process.env.DEAL_ENGINE_EMAIL || "";
const PASSWORD = process.env.DEAL_ENGINE_PASSWORD || "";
const STATIC_TOKEN = process.env.AI_AGENTS_ACCESS_TOKEN || "";

export const DEFAULT_TIMEOUT_MS = 30_000;
// A full memorandum takes a few minutes at high effort; leave generous room.
export const EVALUATION_TIMEOUT_MS = Number(process.env.DEAL_ENGINE_TIMEOUT_MS) || 15 * 60_000;

// Thrown errors reach the model as the tool result's text, so say how to recover.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function httpErrorMessage(status: number, upstream: string | undefined, service: string): string {
  const detail = upstream ? ` ${upstream}` : "";
  switch (status) {
    case 401:
      return `${service} rejected the login (HTTP 401).${detail} Check DEAL_ENGINE_EMAIL / DEAL_ENGINE_PASSWORD, or refresh AI_AGENTS_ACCESS_TOKEN — dashboard session tokens expire after about an hour.`;
    case 402:
      return `No Deal Engine memos left on this plan.${detail} Call dealengine_get_billing_status for usage, and subscribe from the dashboard's Deal Engine page to continue.`;
    case 404:
      return `Not found (HTTP 404).${detail}`;
    case 429:
      return `Rate limited (HTTP 429).${detail}`;
    case 503:
      return `${service} is temporarily unavailable (HTTP 503).${detail} Try again in a minute.`;
    default:
      return `${service} returned HTTP ${status}.${detail}`;
  }
}

async function upstreamError(response: Response, service: string): Promise<ApiError> {
  let upstream: string | undefined;
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown; msg?: unknown };
    const text = body.error ?? body.message ?? body.msg;
    if (typeof text === "string") upstream = text;
  } catch {
    // Not JSON; the status alone has to do.
  }
  return new ApiError(response.status, httpErrorMessage(response.status, upstream, service));
}

async function send(url: string, init: RequestInit, signal: AbortSignal, timeoutMs: number, service: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`${service} did not respond within ${Math.round(timeoutMs / 1000)} seconds. Try again.`);
    }
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      `Could not reach ${service} at ${new URL(url).origin}: ${(error as Error).message}. ` +
        (service === "The AI Agents API" ? "Check AI_AGENTS_API_URL and that the API is running." : "Check SUPABASE_URL.")
    );
  }
}

// ---- Login ----

interface Session {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  userId: string;
}

let session: Session | null = null;
let pending: Promise<Session> | null = null;

export function authMode(): "password" | "token" | "none" {
  if (EMAIL && PASSWORD && SUPABASE_URL && SUPABASE_ANON_KEY) return "password";
  if (STATIC_TOKEN) return "token";
  return "none";
}

// Reads the user id (`sub`) from a Supabase JWT without verifying it; the API
// and Supabase verify the token on every request.
function tokenUserId(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : "";
  } catch {
    return "";
  }
}

async function supabaseToken(grant: "password" | "refresh_token", body: object, signal: AbortSignal): Promise<Session> {
  const response = await send(
    `${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`,
    {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    signal,
    DEFAULT_TIMEOUT_MS,
    "Supabase"
  );
  if (!response.ok) {
    const error = await upstreamError(response, "Supabase");
    if (response.status === 400 && grant === "password") {
      throw new ApiError(401, "Supabase rejected DEAL_ENGINE_EMAIL / DEAL_ENGINE_PASSWORD. Use the email and password you log in to the dashboard with.");
    }
    throw error;
  }
  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { id?: string };
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    userId: data.user?.id || tokenUserId(data.access_token)
  };
}

async function freshSession(signal: AbortSignal): Promise<Session> {
  const mode = authMode();
  if (mode === "token") {
    return { accessToken: STATIC_TOKEN, expiresAt: Infinity, userId: tokenUserId(STATIC_TOKEN) };
  }
  if (mode === "none") {
    throw new ApiError(
      401,
      "This tool needs a dashboard login. Set DEAL_ENGINE_EMAIL, DEAL_ENGINE_PASSWORD, SUPABASE_URL and SUPABASE_ANON_KEY in the MCP server's environment (or AI_AGENTS_ACCESS_TOKEN), then restart it."
    );
  }
  // Refresh a minute before expiry; fall back to a new password login.
  if (session?.refreshToken) {
    try {
      return await supabaseToken("refresh_token", { refresh_token: session.refreshToken }, signal);
    } catch {
      // Refresh token revoked or expired.
    }
  }
  return supabaseToken("password", { email: EMAIL, password: PASSWORD }, signal);
}

export async function getSession(signal: AbortSignal): Promise<Session> {
  if (session && session.expiresAt - 60_000 > Date.now()) return session;
  // Concurrent tool calls share one sign-in.
  pending ??= freshSession(signal).finally(() => {
    pending = null;
  });
  session = await pending;
  return session;
}

// ---- AI Agents API ----

interface ApiOptions {
  method?: "GET" | "POST";
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

export async function apiFetch(path: string, signal: AbortSignal, options: ApiOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth) headers.Authorization = `Bearer ${(await getSession(signal)).accessToken}`;
  const response = await send(
    `${API_BASE_URL}${path}`,
    {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    },
    signal,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    "The AI Agents API"
  );
  if (!response.ok) throw await upstreamError(response, "The AI Agents API");
  return response;
}

export async function apiRequest<T>(path: string, signal: AbortSignal, options: ApiOptions = {}): Promise<T> {
  return (await (await apiFetch(path, signal, options)).json()) as T;
}

// ---- Supabase REST (saved deals; row-level security scopes rows to the user) ----

export function savedDealsAvailable(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && authMode() !== "none");
}

interface RestOptions {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  prefer?: string;
}

export async function supabaseRest(table: string, signal: AbortSignal, options: RestOptions = {}): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Saved deals need SUPABASE_URL and SUPABASE_ANON_KEY (the dashboard's VITE_SUPABASE_* values) in the MCP server's environment.");
  }
  const { accessToken } = await getSession(signal);
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json"
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.prefer) headers.Prefer = options.prefer;
  const response = await send(
    url.href,
    { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) },
    signal,
    DEFAULT_TIMEOUT_MS,
    "Supabase"
  );
  if (!response.ok) throw await upstreamError(response, "Supabase");
  return response;
}
