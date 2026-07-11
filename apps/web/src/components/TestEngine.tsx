"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Test } from "@/lib/types";
import { QuestionRenderer } from "./QuestionRenderer";
import { Calculator } from "./Calculator";
import {
  rawScore,
  scaledScore,
  skillBreakdown,
  isCorrect,
  type AnswerMap,
} from "@/lib/scoring";

type Phase = "intro" | "active" | "review" | "submitted";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TestEngine({ test }: { test: Test }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState(test.timeLimitSeconds);
  const [showTimer, setShowTimer] = useState(true);
  const [showCalc, setShowCalc] = useState(false);

  const q = test.questions[index];

  // Countdown; auto-submit at zero (matches real proctoring).
  useEffect(() => {
    if (phase !== "active" && phase !== "review") return;
    if (remaining <= 0) {
      setPhase("submitted");
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, remaining]);

  const answeredCount = useMemo(
    () => test.questions.filter((qq) => answers[qq.id] != null && (!Array.isArray(answers[qq.id]) || (answers[qq.id] as string[]).length > 0)).length,
    [answers, test.questions],
  );

  if (phase === "intro") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-testblue">{test.name}</h1>
        <ul className="mt-6 space-y-2 text-sm text-neutral-700">
          <li>• {test.questions.length} questions</li>
          <li>• {Math.round(test.timeLimitSeconds / 60)} minutes</li>
          <li>• Section: {test.section}</li>
          <li>• You may mark questions for review and navigate freely within the section.</li>
        </ul>
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => setPhase("active")}
            className="rounded bg-testblue px-6 py-2 font-medium text-white"
          >
            Begin section
          </button>
          <Link href="/" className="rounded border border-testline px-6 py-2">
            Back to catalog
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "submitted") {
    const raw = rawScore(test.questions, answers);
    const scaled = scaledScore(test.section, raw, test.questions.length);
    const breakdown = skillBreakdown(test.questions, answers);
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-testblue">{test.name} — Results</h1>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-testline bg-white p-4">
            <div className="text-xs uppercase text-neutral-500">Scaled score</div>
            <div className="text-3xl font-semibold">{scaled}</div>
            <div className="text-xs text-neutral-500">130–170 (estimated)</div>
          </div>
          <div className="rounded-lg border border-testline bg-white p-4">
            <div className="text-xs uppercase text-neutral-500">Raw</div>
            <div className="text-3xl font-semibold">{raw}/{test.questions.length}</div>
          </div>
        </div>

        <h2 className="mt-10 text-lg font-semibold">Weakest skills</h2>
        <div className="mt-3 space-y-2">
          {breakdown.map((row) => (
            <div key={row.skillTag} className="flex items-center gap-3">
              <div className="w-56 text-sm">{row.skillTag}</div>
              <div className="h-3 flex-1 overflow-hidden rounded bg-neutral-200">
                <div
                  className="h-full bg-testblue"
                  style={{ width: `${(row.correct / row.total) * 100}%` }}
                />
              </div>
              <div className="w-16 text-right text-sm text-neutral-600">
                {row.correct}/{row.total}
              </div>
            </div>
          ))}
        </div>

        <h2 className="mt-10 text-lg font-semibold">Answer review</h2>
        <div className="mt-3 space-y-4">
          {test.questions.map((qq, i) => {
            const correct = isCorrect(qq, answers[qq.id] ?? null);
            return (
              <details key={qq.id} className="rounded border border-testline bg-white p-4">
                <summary className="cursor-pointer">
                  <span className={correct ? "text-green-700" : "text-red-700"}>
                    {correct ? "✓" : "✗"}
                  </span>{" "}
                  <span className="font-medium">Question {i + 1}</span>{" "}
                  <span className="text-neutral-500">({qq.skillTag})</span>
                </summary>
                <p className="mt-3 whitespace-pre-line text-sm text-neutral-700">{qq.stem}</p>
                <p className="mt-2 text-sm">
                  <span className="font-semibold">Correct answer: </span>
                  {qq.questionType === "NUMERIC_ENTRY"
                    ? qq.numericAnswer
                    : qq.choices.filter((c) => c.isCorrect).map((c) => c.id).join(", ")}
                </p>
                <p className="mt-2 text-sm text-neutral-700">{qq.explanation}</p>
              </details>
            );
          })}
        </div>

        <Link href="/" className="mt-8 inline-block rounded bg-testblue px-6 py-2 text-white">
          Back to catalog
        </Link>
      </main>
    );
  }

  // active / review
  return (
    <div className="test-shell">
      {/* Top chrome */}
      <header className="flex items-center justify-between border-b border-testline bg-white px-6 py-3">
        <div className="text-sm font-medium">{test.name}</div>
        <div className="flex items-center gap-4 text-sm">
          {test.section === "QUANT" && (
            <button
              onClick={() => setShowCalc((s) => !s)}
              className="rounded border border-testline px-3 py-1"
            >
              Calculator
            </button>
          )}
          <button onClick={() => setShowTimer((s) => !s)} className="text-neutral-500 underline">
            {showTimer ? "Hide" : "Show"} time
          </button>
          <span className={`font-mono ${remaining <= 300 ? "text-red-600" : ""}`}>
            {showTimer ? fmt(remaining) : "—:—"}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-hidden px-6 py-6">
        {phase === "review" ? (
          <ReviewGrid
            test={test}
            answers={answers}
            marks={marks}
            onJump={(i) => {
              setIndex(i);
              setPhase("active");
            }}
          />
        ) : (
          <div className="mx-auto h-full max-w-5xl">
            <div className="mb-3 text-xs uppercase tracking-wide text-neutral-500">
              Question {index + 1} of {test.questions.length}
              {marks[q.id] && <span className="ml-2 text-amber-600">● marked</span>}
            </div>
            <QuestionRenderer
              question={q}
              answer={answers[q.id] ?? null}
              onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
            />
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <footer className="flex items-center justify-between border-t border-testline bg-white px-6 py-3">
        <div className="flex gap-2">
          <button
            disabled={index === 0 || phase === "review"}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="rounded border border-testline px-4 py-1.5 disabled:opacity-40"
          >
            Back
          </button>
          <button
            onClick={() => setMarks((m) => ({ ...m, [q.id]: !m[q.id] }))}
            disabled={phase === "review"}
            className="rounded border border-testline px-4 py-1.5 disabled:opacity-40"
          >
            {marks[q.id] ? "Unmark" : "Mark for review"}
          </button>
        </div>

        <div className="text-xs text-neutral-500">
          {answeredCount}/{test.questions.length} answered
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setPhase(phase === "review" ? "active" : "review")}
            className="rounded border border-testline px-4 py-1.5"
          >
            {phase === "review" ? "Return" : "Review"}
          </button>
          {index === test.questions.length - 1 || phase === "review" ? (
            <button
              onClick={() => setPhase("submitted")}
              className="rounded bg-testblue px-4 py-1.5 font-medium text-white"
            >
              Submit section
            </button>
          ) : (
            <button
              onClick={() => setIndex((i) => Math.min(test.questions.length - 1, i + 1))}
              className="rounded bg-testblue px-4 py-1.5 font-medium text-white"
            >
              Next
            </button>
          )}
        </div>
      </footer>

      {showCalc && test.section === "QUANT" && <Calculator onClose={() => setShowCalc(false)} />}
    </div>
  );
}

function ReviewGrid({
  test,
  answers,
  marks,
  onJump,
}: {
  test: Test;
  answers: AnswerMap;
  marks: Record<string, boolean>;
  onJump: (i: number) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold">Review screen</h2>
      <p className="mb-4 text-sm text-neutral-600">
        Click a question to return to it. You can still change answers until you submit the section.
      </p>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
        {test.questions.map((qq, i) => {
          const ans = answers[qq.id];
          const answered = ans != null && (!Array.isArray(ans) || ans.length > 0);
          return (
            <button
              key={qq.id}
              onClick={() => onJump(i)}
              className={`relative rounded border py-3 text-sm ${
                answered ? "border-testblue bg-blue-50" : "border-testline bg-white"
              }`}
            >
              {i + 1}
              {marks[qq.id] && (
                <span className="absolute right-1 top-0.5 text-[10px] text-amber-600">●</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex gap-4 text-xs text-neutral-500">
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded border border-testblue bg-blue-50 align-middle" />
          answered
        </span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded border border-testline bg-white align-middle" />
          unanswered
        </span>
        <span>
          <span className="mr-1 text-amber-600">●</span> marked
        </span>
      </div>
    </div>
  );
}
