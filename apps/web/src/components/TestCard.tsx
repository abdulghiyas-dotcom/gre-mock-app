"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TestSummary } from "@/lib/types";
import { loadAttempt, type AttemptStatus } from "@/lib/attemptStore";
import { getUser } from "@/lib/auth";

const STATUS_LABEL: Record<AttemptStatus, string> = {
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
};

export function TestCard({ test }: { test: TestSummary }) {
  const [status, setStatus] = useState<AttemptStatus | null>(null);

  useEffect(() => {
    const uid = getUser()?.id ?? "anon";
    setStatus(loadAttempt(uid, test.id)?.status ?? null);
  }, [test.id]);

  const cta =
    status === "in_progress" || status === "paused" ? "Resume" : status === "completed" ? "Retake" : "Start";

  return (
    <Link
      href={`/test/${test.id}`}
      className="block rounded-lg border border-testline bg-white p-5 shadow-sm transition hover:border-testblue hover:shadow"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {test.kind.replace(/_/g, " ")}
        </div>
        {status && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              status === "completed"
                ? "bg-green-100 text-green-800"
                : status === "paused"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-blue-100 text-blue-800"
            }`}
          >
            {STATUS_LABEL[status]}
          </span>
        )}
      </div>
      <h2 className="mt-1 text-lg font-semibold">{test.name}</h2>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
        <span>{test.sectionCount} sections</span>
        <span>{test.totalQuestions} questions</span>
        {test.hasEssay && <span>+ essay</span>}
        <span>{Math.round(test.totalTimeSeconds / 60)} min</span>
      </div>
      <div className="mt-4 inline-block rounded bg-testblue px-4 py-1.5 text-sm font-medium text-white">
        {cta}
      </div>
    </Link>
  );
}
