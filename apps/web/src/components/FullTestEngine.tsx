"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Difficulty, Question, SectionDef, TestDef } from "@/lib/types";
import { QuestionRenderer } from "./QuestionRenderer";
import { Calculator } from "./Calculator";
import { AwaEditor } from "./AwaEditor";
import {
  rawScore,
  skillBreakdown,
  isCorrect,
  routeDifficulty,
  selectAdaptiveQuestions,
  type AnswerMap,
} from "@/lib/scoring";
import { scaledFromRaw } from "@/lib/scoreConversion";
import { getUser } from "@/lib/auth";
import { loadAttempt, saveAttempt } from "@/lib/attemptStore";

type Phase = "section-intro" | "active" | "review" | "results";

interface SectionRun {
  index: number;
  answers: AnswerMap;
  marks: Record<string, boolean>;
  remaining: number;
  submitted: boolean;
  essay?: string;
  administeredLevel?: Difficulty; // adaptive sections only
}

interface AttemptState {
  sectionIx: number;
  phase: Phase;
  runs: Record<string, SectionRun>;
}

interface EssayResult {
  score: number;
  feedback: string;
  strengths?: string[];
  improvements?: string[];
  heuristic?: boolean;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function freshRun(section: SectionDef): SectionRun {
  return { index: 0, answers: {}, marks: {}, remaining: section.timeLimitSeconds, submitted: false };
}

export function FullTestEngine({ test }: { test: TestDef }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("anon");
  const [hydrated, setHydrated] = useState(false);

  const [state, setState] = useState<AttemptState>(() => ({
    sectionIx: 0,
    phase: "section-intro",
    runs: Object.fromEntries(test.sections.map((s) => [s.id, freshRun(s)])),
  }));
  const [showTimer, setShowTimer] = useState(true);
  const [showCalc, setShowCalc] = useState(false);
  const [essayResult, setEssayResult] = useState<EssayResult | null>(null);

  const section = test.sections[state.sectionIx];
  const run = state.runs[section.id];

  // Resolve the question list for the current section. Non-adaptive sections use
  // their fixed list; an adaptive section-2 routes from the matching section-1's
  // raw score. (Routing is client-side here; docs/ARCHITECTURE.md §4 makes it
  // server-authoritative in production so difficulty can't be inspected.)
  const resolved = useMemo<{ questions: Question[]; administeredLevel?: Difficulty }>(() => {
    if (section.kind === "AWA") return { questions: [] };
    if (!section.adaptive || !section.pools) return { questions: section.questions ?? [] };
    const priorId = section.kind === "VERBAL" ? "verbal-1" : "quant-1";
    const prior = test.sections.find((s) => s.id === priorId);
    const priorRun = state.runs[priorId];
    const priorQs = prior?.questions ?? [];
    const raw = priorRun ? rawScore(priorQs, priorRun.answers) : 0;
    const routed = routeDifficulty(section.kind, raw, priorQs.length);
    const picked = selectAdaptiveQuestions(section.pools, routed, section.questionCount ?? 0);
    return { questions: picked.questions, administeredLevel: picked.administeredLevel };
  }, [section, state.runs, test.sections]);

  const questions = resolved.questions;
  const q = questions[run.index];

  // Hydrate saved attempt after mount.
  useEffect(() => {
    const u = getUser();
    const uid = u?.id ?? "anon";
    setUserId(uid);
    const saved = loadAttempt<AttemptState>(uid, test.id);
    if (saved && saved.status !== "completed") setState(saved.state);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const status = state.phase === "results" ? "completed" : "in_progress";
    saveTimer.current = setTimeout(() => saveAttempt(userId, test.id, status, state), 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [hydrated, state, userId, test.id]);

  const patchRun = useCallback(
    (partial: Partial<SectionRun>) =>
      setState((s) => ({ ...s, runs: { ...s.runs, [section.id]: { ...s.runs[section.id], ...partial } } })),
    [section.id],
  );

  // Countdown for the active section; auto-submit at zero.
  useEffect(() => {
    if (!hydrated) return;
    if (state.phase !== "active" && state.phase !== "review") return;
    if (run.remaining <= 0) {
      submitSection();
      return;
    }
    const t = setTimeout(() => patchRun({ remaining: run.remaining - 1 }), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, state.phase, run.remaining]);

  function advanceSection() {
    setState((s) => {
      const next = s.sectionIx + 1;
      if (next >= test.sections.length) return { ...s, phase: "results" };
      return { ...s, sectionIx: next, phase: "section-intro" };
    });
  }

  function submitSection() {
    // Stamp the administered adaptive level so scoring uses the right curve tier.
    patchRun({ submitted: true, administeredLevel: resolved.administeredLevel });
    advanceSection();
  }

  const saveAndExit = () => {
    saveAttempt(userId, test.id, "paused", state);
    router.push("/");
  };

  // ---- Results phase: score essay once on entry ----
  useEffect(() => {
    if (state.phase !== "results") return;
    const awa = test.sections.find((s) => s.kind === "AWA");
    if (!awa) return;
    const essay = state.runs[awa.id]?.essay ?? "";
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/score-essay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ promptText: awa.essayPromptText ?? "", essayText: essay }),
        });
        const data = (await res.json()) as EssayResult;
        if (!cancelled) setEssayResult(data);
      } catch {
        if (!cancelled) setEssayResult({ score: 0, feedback: "Essay scoring unavailable." });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  if (!hydrated) {
    return <main className="p-12 text-sm text-neutral-500">Loading…</main>;
  }

  if (state.phase === "results") {
    return <Results test={test} runs={state.runs} essayResult={essayResult} />;
  }

  // ---- Section intro ----
  if (state.phase === "section-intro") {
    const n = state.sectionIx + 1;
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="text-xs uppercase tracking-wide text-neutral-500">
          Section {n} of {test.sections.length}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-testblue">{section.title}</h1>
        <ul className="mt-6 space-y-2 text-sm text-neutral-700">
          <li>• Time: {Math.round(section.timeLimitSeconds / 60)} minutes</li>
          {section.kind === "AWA" ? (
            <li>• Write an essay analyzing the issue. Plain-text editor; no formatting.</li>
          ) : (
            <>
              <li>• {questions.length} questions</li>
              <li>• Navigate freely and mark questions within this section.</li>
              {section.adaptive && (
                <li className="text-neutral-500">
                  • Difficulty set adaptively from your previous {section.kind.toLowerCase()} section
                  {resolved.administeredLevel ? ` → ${resolved.administeredLevel}` : ""}.
                </li>
              )}
              <li className="text-amber-700">• Once you submit a section you cannot return to it.</li>
            </>
          )}
        </ul>
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => setState((s) => ({ ...s, phase: "active" }))}
            className="rounded bg-testblue px-6 py-2 font-medium text-white"
          >
            {section.kind === "AWA" ? "Begin writing" : "Begin section"}
          </button>
          <button onClick={saveAndExit} className="rounded border border-testline px-6 py-2">
            Save &amp; exit
          </button>
        </div>
      </main>
    );
  }

  // ---- Active AWA section ----
  if (section.kind === "AWA") {
    return (
      <div className="test-shell">
        <TopBar
          title={section.title}
          remaining={run.remaining}
          showTimer={showTimer}
          onToggleTimer={() => setShowTimer((s) => !s)}
          onExit={saveAndExit}
        />
        <div className="flex-1 overflow-hidden px-6 py-6">
          <AwaEditor
            promptText={section.essayPromptText ?? ""}
            value={run.essay ?? ""}
            onChange={(v) => patchRun({ essay: v })}
          />
        </div>
        <footer className="flex justify-end bg-gretop px-6 py-3">
          <button onClick={submitSection} className="rounded bg-testblue px-5 py-1.5 font-medium text-white">
            Submit essay
          </button>
        </footer>
      </div>
    );
  }

  // ---- Active Verbal/Quant section ----
  return (
    <div className="test-shell">
      <TopBar
        title={section.title}
        remaining={run.remaining}
        showTimer={showTimer}
        onToggleTimer={() => setShowTimer((s) => !s)}
        onExit={saveAndExit}
        calc={section.kind === "QUANT" ? () => setShowCalc((s) => !s) : undefined}
      />

      <div className="flex-1 overflow-hidden px-6 py-6">
        {state.phase === "review" ? (
          <ReviewGrid
            questions={questions}
            run={run}
            onJump={(i) => setState((s) => ({ ...s, phase: "active", runs: { ...s.runs, [section.id]: { ...run, index: i } } }))}
          />
        ) : (
          <div className="mx-auto h-full max-w-5xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <span>Question {run.index + 1} of {questions.length}</span>
              {run.marks[q.id] && (
                <span className="flex items-center gap-1 text-amber-700">
                  <svg viewBox="0 0 16 16" className="h-3 w-3 fill-amber-600">
                    <path d="M3 1h9l-3 4 3 4H3v6H2V1z" />
                  </svg>
                  Marked for Review
                </span>
              )}
            </div>
            <QuestionRenderer
              question={q}
              answer={run.answers[q.id] ?? null}
              onChange={(a) => patchRun({ answers: { ...run.answers, [q.id]: a } })}
            />
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between bg-gretop px-6 py-3 text-white">
        <div className="flex items-center gap-2">
          <button
            disabled={run.index === 0 || state.phase === "review"}
            onClick={() => patchRun({ index: Math.max(0, run.index - 1) })}
            className="rounded border border-white/30 bg-white/10 px-4 py-1.5 disabled:opacity-30"
          >
            Back
          </button>
          <button
            disabled={state.phase === "review"}
            onClick={() => patchRun({ marks: { ...run.marks, [q.id]: !run.marks[q.id] } })}
            className={`flex items-center gap-2 rounded border border-white/30 px-4 py-1.5 disabled:opacity-30 ${
              run.marks[q.id] ? "bg-amber-500 text-black" : "bg-white/10"
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                run.marks[q.id] ? "border-black bg-black" : "border-white/60"
              }`}
            >
              {run.marks[q.id] && (
                <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-none stroke-white stroke-[3]">
                  <path d="M3 8.5 L6.5 12 L13 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            Mark for Review
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setState((s) => ({ ...s, phase: s.phase === "review" ? "active" : "review" }))}
            className="rounded border border-white/30 bg-white/10 px-4 py-1.5 hover:bg-white/20"
          >
            {state.phase === "review" ? "Return" : "Review"}
          </button>
          {run.index === questions.length - 1 || state.phase === "review" ? (
            <button onClick={submitSection} className="rounded bg-testblue px-5 py-1.5 font-medium text-white">
              Submit section
            </button>
          ) : (
            <button
              onClick={() => patchRun({ index: Math.min(questions.length - 1, run.index + 1) })}
              className="rounded bg-testblue px-5 py-1.5 font-medium text-white"
            >
              Next
            </button>
          )}
        </div>
      </footer>

      {showCalc && section.kind === "QUANT" && <Calculator onClose={() => setShowCalc(false)} />}
    </div>
  );
}

function TopBar({
  title,
  remaining,
  showTimer,
  onToggleTimer,
  onExit,
  calc,
}: {
  title: string;
  remaining: number;
  showTimer: boolean;
  onToggleTimer: () => void;
  onExit: () => void;
  calc?: () => void;
}) {
  return (
    <header className="flex items-center justify-between bg-gretop px-6 py-3 text-white">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        {calc && (
          <button onClick={calc} className="rounded border border-white/30 bg-white/10 px-3 py-1 hover:bg-white/20">
            Calculator
          </button>
        )}
        <div className="flex items-center gap-2 rounded border border-white/30 bg-white/10 px-3 py-1">
          <button onClick={onToggleTimer} className="text-white/70 underline">
            {showTimer ? "Hide" : "Show"}
          </button>
          <span className={`font-mono tabular-nums ${remaining <= 300 ? "text-red-400" : ""}`}>
            {showTimer ? fmt(remaining) : "—:—"}
          </span>
        </div>
        <button
          onClick={onExit}
          className="rounded border border-white/30 bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
        >
          Save &amp; exit
        </button>
      </div>
    </header>
  );
}

function ReviewGrid({
  questions,
  run,
  onJump,
}: {
  questions: Question[];
  run: SectionRun;
  onJump: (i: number) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold">Review Section</h2>
      <p className="mb-4 text-sm text-neutral-600">
        Click a question number to go directly to that question. You can change your answers until you
        submit the section.
      </p>
      <div className="mb-4 flex items-center gap-5 text-xs text-neutral-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-testblue bg-[#dceafb]" /> Answered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-neutral-400 bg-white" /> Unanswered
        </span>
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-amber-600">
            <path d="M3 1h9l-3 4 3 4H3v6H2V1z" />
          </svg>
          Marked for Review
        </span>
      </div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
        {questions.map((qq, i) => {
          const ans = run.answers[qq.id];
          const answered = ans != null && (!Array.isArray(ans) || ans.length > 0);
          return (
            <button
              key={qq.id}
              onClick={() => onJump(i)}
              className={`relative flex items-center justify-center rounded-full border-2 py-3 text-sm ${
                answered ? "border-testblue bg-[#dceafb]" : "border-neutral-400 bg-white"
              }`}
            >
              {i + 1}
              {run.marks[qq.id] && (
                <svg viewBox="0 0 16 16" className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-amber-600">
                  <path d="M3 1h9l-3 4 3 4H3v6H2V1z" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Results({
  test,
  runs,
  essayResult,
}: {
  test: TestDef;
  runs: Record<string, SectionRun>;
  essayResult: EssayResult | null;
}) {
  const verbalSections = test.sections.filter((s) => s.kind === "VERBAL");
  const quantSections = test.sections.filter((s) => s.kind === "QUANT");

  function sectionScore(sections: SectionDef[]): { scaled: number; raw: number; total: number; level: Difficulty } | null {
    if (sections.length === 0) return null;
    let raw = 0;
    let total = 0;
    let level: Difficulty = "MEDIUM";
    const allQs: Question[] = [];
    for (const s of sections) {
      const run = runs[s.id];
      // Recompute the adaptive section's question set from its stamped level.
      const qs = s.adaptive && s.pools
        ? selectAdaptiveQuestions(s.pools, run?.administeredLevel ?? "MEDIUM", s.questionCount ?? 0).questions
        : s.questions ?? [];
      allQs.push(...qs);
      raw += rawScore(qs, run?.answers ?? {});
      total += qs.length;
      if (s.adaptive && run?.administeredLevel) level = run.administeredLevel;
    }
    return { scaled: scaledFromRaw(raw, total, level), raw, total, level };
  }

  const verbal = sectionScore(verbalSections);
  const quant = sectionScore(quantSections);

  // Skill breakdown + answer review across all V/Q questions.
  const allQuestions: Question[] = [];
  const mergedAnswers: AnswerMap = {};
  for (const s of [...verbalSections, ...quantSections]) {
    const run = runs[s.id];
    const qs = s.adaptive && s.pools
      ? selectAdaptiveQuestions(s.pools, run?.administeredLevel ?? "MEDIUM", s.questionCount ?? 0).questions
      : s.questions ?? [];
    allQuestions.push(...qs);
    Object.assign(mergedAnswers, run?.answers ?? {});
  }
  const breakdown = skillBreakdown(allQuestions, mergedAnswers);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-testblue">{test.name} — Results</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {verbal && <ScoreCard label="Verbal" value={verbal.scaled} sub={`${verbal.raw}/${verbal.total} raw · §2 ${verbal.level}`} />}
        {quant && <ScoreCard label="Quant" value={quant.scaled} sub={`${quant.raw}/${quant.total} raw · §2 ${quant.level}`} />}
        {test.sections.some((s) => s.kind === "AWA") && (
          <ScoreCard
            label="Analytical Writing"
            value={essayResult ? essayResult.score : "…"}
            sub={essayResult?.heuristic ? "0–6 (heuristic)" : "0–6"}
          />
        )}
      </div>

      {essayResult && (
        <section className="mt-8 rounded-lg border border-testline bg-white p-5">
          <h2 className="text-lg font-semibold">Essay feedback</h2>
          <p className="mt-2 text-sm text-neutral-700">{essayResult.feedback}</p>
          {!!essayResult.strengths?.length && (
            <p className="mt-2 text-sm"><span className="font-semibold">Strengths: </span>{essayResult.strengths.join("; ")}</p>
          )}
          {!!essayResult.improvements?.length && (
            <p className="mt-1 text-sm"><span className="font-semibold">Improve: </span>{essayResult.improvements.join("; ")}</p>
          )}
        </section>
      )}

      {breakdown.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold">Weakest skills</h2>
          <div className="mt-3 space-y-2">
            {breakdown.map((row) => (
              <div key={row.skillTag} className="flex items-center gap-3">
                <div className="w-56 text-sm">{row.skillTag}</div>
                <div className="h-3 flex-1 overflow-hidden rounded bg-neutral-200">
                  <div className="h-full bg-testblue" style={{ width: `${(row.correct / row.total) * 100}%` }} />
                </div>
                <div className="w-16 text-right text-sm text-neutral-600">{row.correct}/{row.total}</div>
              </div>
            ))}
          </div>

          <h2 className="mt-10 text-lg font-semibold">Answer review</h2>
          <div className="mt-3 space-y-3">
            {allQuestions.map((qq, i) => {
              const correct = isCorrect(qq, mergedAnswers[qq.id] ?? null);
              return (
                <details key={qq.id} className="rounded border border-testline bg-white p-4">
                  <summary className="cursor-pointer">
                    <span className={correct ? "text-green-700" : "text-red-700"}>{correct ? "✓" : "✗"}</span>{" "}
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
        </>
      )}

      <Link href="/" className="mt-8 inline-block rounded bg-testblue px-6 py-2 text-white">
        Back to catalog
      </Link>
    </main>
  );
}

function ScoreCard({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="rounded-lg border border-testline bg-white p-4">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-xs text-neutral-500">{sub}</div>
    </div>
  );
}
