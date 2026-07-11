// Attempt persistence — the DEV implementation of the checkpoint contract from
// docs/ARCHITECTURE.md §2: the client owns test state and mirrors it to durable
// storage on every change, so a refresh, tab close, or "exit" never loses more
// than the last write and a paused test resumes exactly where it left off. Here
// the sink is localStorage, namespaced per user; in production the same
// save/load/clear calls are backed by Redis (warm) + Postgres (checkpoint).

export type AttemptStatus = "in_progress" | "paused" | "completed";

export interface SavedAttempt<T = unknown> {
  testId: string;
  status: AttemptStatus;
  updatedAt: number;
  state: T; // opaque to the store; the engine defines its own shape
}

const key = (userId: string, testId: string) => `gre-attempt:${userId}:${testId}`;

export function loadAttempt<T = unknown>(userId: string, testId: string): SavedAttempt<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(userId, testId));
    return raw ? (JSON.parse(raw) as SavedAttempt<T>) : null;
  } catch {
    return null;
  }
}

export function saveAttempt<T>(userId: string, testId: string, status: AttemptStatus, state: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key(userId, testId),
      JSON.stringify({ testId, status, updatedAt: Date.now(), state } satisfies SavedAttempt<T>),
    );
  } catch {
    /* quota / disabled storage — non-fatal in dev */
  }
}

export function clearAttempt(userId: string, testId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(userId, testId));
  } catch {
    /* non-fatal */
  }
}
