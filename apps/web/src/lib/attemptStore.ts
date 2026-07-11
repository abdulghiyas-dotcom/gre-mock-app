import type { AnswerMap } from "./scoring";

// Attempt persistence. This is the DEV implementation of the checkpoint
// contract from docs/ARCHITECTURE.md §2: the client owns test state and mirrors
// it to durable storage on every change, so a refresh, tab close, or "exit"
// never loses more than the last write and a paused test resumes at the exact
// remaining time. Here the sink is localStorage; in production the same
// save/load/clear calls are backed by Redis (warm) + Postgres (checkpoint).

export type AttemptStatus = "in_progress" | "paused" | "completed";

export interface SavedAttempt {
  testId: string;
  status: AttemptStatus;
  index: number;
  answers: AnswerMap;
  marks: Record<string, boolean>;
  remaining: number; // seconds left on the section clock — restored verbatim
  updatedAt: number;
}

const key = (testId: string) => `gre-attempt:${testId}`;

export function loadAttempt(testId: string): SavedAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(testId));
    return raw ? (JSON.parse(raw) as SavedAttempt) : null;
  } catch {
    return null;
  }
}

export function saveAttempt(a: SavedAttempt): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(a.testId), JSON.stringify({ ...a, updatedAt: Date.now() }));
  } catch {
    /* quota / disabled storage — non-fatal in dev */
  }
}

export function clearAttempt(testId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(testId));
  } catch {
    /* non-fatal */
  }
}
