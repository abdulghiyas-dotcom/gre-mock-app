"use client";

import { useEffect, useState } from "react";
import type { TestSummary } from "@/lib/types";
import { TestCard } from "./TestCard";
import { getUser, signIn, signOut, type User } from "@/lib/auth";

export function CatalogGate({ tests }: { tests: TestSummary[] }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setUser(getUser());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!user) {
    return (
      <main className="mx-auto max-w-sm px-6 py-24">
        <h1 className="text-2xl font-semibold text-testblue">GRE Mock Test Platform</h1>
        <p className="mt-2 text-sm text-neutral-600">Enter a name to begin. Your progress is saved per user.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setUser(signIn(name.trim()));
          }}
          className="mt-6 space-y-3"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded border border-testline px-3 py-2"
          />
          <button type="submit" className="w-full rounded bg-testblue px-4 py-2 font-medium text-white">
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-testblue">GRE Mock Test Platform</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Signed in as {user.name}. Questions come from a pre-generated, verified bank — no waiting.
          </p>
        </div>
        <button
          onClick={() => {
            signOut();
            setUser(null);
          }}
          className="rounded border border-testline px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {tests.map((t) => (
          <TestCard key={t.id} test={t} />
        ))}
      </section>
    </main>
  );
}
