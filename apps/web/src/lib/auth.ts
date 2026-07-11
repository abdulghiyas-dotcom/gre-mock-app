"use client";

// DEV auth: a lightweight local identity so the catalog is gated and attempts
// are namespaced per user. This is the seam for real auth — replace get/signIn/
// signOut with NextAuth (Auth.js) session calls (see docs/ARCHITECTURE.md) and
// nothing else in the UI changes.

export interface User {
  id: string;
  name: string;
}

const KEY = "gre-user";

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function signIn(name: string): User {
  const user: User = { id: `local-${name.toLowerCase().replace(/\s+/g, "-")}`, name };
  window.localStorage.setItem(KEY, JSON.stringify(user));
  return user;
}

export function signOut(): void {
  window.localStorage.removeItem(KEY);
}
