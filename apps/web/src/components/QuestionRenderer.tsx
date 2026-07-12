"use client";

import type { Question } from "@/lib/types";

type Answer = string[] | number | null;

interface Props {
  question: Question;
  answer: Answer;
  onChange: (a: Answer) => void;
}

// Group choices by blank for two-blank/three-blank Text Completion, where ids
// are prefixed "i-", "ii-", "iii-". Single-blank items have no prefix.
function blankGroups(question: Question): { blank: string; choices: Question["choices"] }[] {
  const hasPrefix = question.choices.some((c) => /^(i{1,3})-/.test(c.id));
  if (!hasPrefix) return [{ blank: "single", choices: question.choices }];
  const order = ["i", "ii", "iii"];
  return order
    .map((b) => ({ blank: b, choices: question.choices.filter((c) => c.id.startsWith(`${b}-`)) }))
    .filter((g) => g.choices.length > 0);
}

// Quantitative Comparison stems are authored as "Quantity A: ...\nQuantity B: ..."
// with any shared setup text on preceding lines. Split it out for the official
// two-box layout instead of showing it as plain paragraph text.
function splitQuantComparison(stem: string): { setup: string; a: string; b: string } | null {
  const lines = stem.split("\n");
  const aIx = lines.findIndex((l) => l.trim().startsWith("Quantity A:"));
  const bIx = lines.findIndex((l) => l.trim().startsWith("Quantity B:"));
  if (aIx === -1 || bIx === -1) return null;
  return {
    setup: lines.slice(0, aIx).join("\n").trim(),
    a: lines[aIx].replace(/^\s*Quantity A:\s*/, "").trim(),
    b: lines[bIx].replace(/^\s*Quantity B:\s*/, "").trim(),
  };
}

// Oval (radio-style) selector: used for every question type except select-all,
// matching the real GRE's on-screen convention of an unlabeled oval bullet.
function OvalRow({
  picked,
  label,
  onClick,
}: {
  picked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left ${
        picked ? "bg-[#dceafb]" : "hover:bg-neutral-100"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          picked ? "border-testblue bg-testblue" : "border-neutral-400 bg-white"
        }`}
      >
        {picked && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="text-[15px] leading-snug">{label}</span>
    </button>
  );
}

// Square (checkbox-style) selector: used only for "select all that apply"
// questions, matching the real GRE's convention of distinguishing select-all
// items from single/exactly-N-selection items via square vs. oval markers.
function SquareRow({
  picked,
  label,
  onClick,
}: {
  picked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left ${
        picked ? "bg-[#dceafb]" : "hover:bg-neutral-100"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
          picked ? "border-testblue bg-testblue" : "border-neutral-400 bg-white"
        }`}
      >
        {picked && (
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-white stroke-[2.5]">
            <path d="M3 8.5 L6.5 12 L13 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-[15px] leading-snug">{label}</span>
    </button>
  );
}

export function QuestionRenderer({ question, answer, onChange }: Props) {
  const selected = Array.isArray(answer) ? answer : [];

  const toggleSingle = (id: string) => onChange([id]);
  const toggleMulti = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  // Sentence Equivalence: exactly two selections.
  const toggleSE = (id: string) => {
    if (selected.includes(id)) return onChange(selected.filter((x) => x !== id));
    if (selected.length >= 2) return; // block a third selection
    onChange([...selected, id]);
  };

  // Two-blank Text Completion: one selection per blank group.
  const toggleBlank = (blank: string, id: string) => {
    const others = selected.filter((x) => !x.startsWith(`${blank}-`));
    onChange([...others, id]);
  };

  const qc = question.questionType === "QUANT_COMPARISON" ? splitQuantComparison(question.stem) : null;

  const body = (
    <div>
      {qc ? (
        <div>
          {qc.setup && <p className="mb-4 whitespace-pre-line text-[17px] leading-relaxed">{qc.setup}</p>}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-testline bg-testline">
            <div className="bg-white px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quantity A</div>
              <div className="mt-2 text-[17px]">{qc.a}</div>
            </div>
            <div className="bg-white px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Quantity B</div>
              <div className="mt-2 text-[17px]">{qc.b}</div>
            </div>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line text-[17px] leading-relaxed">{question.stem}</p>
      )}

      {question.questionType === "NUMERIC_ENTRY" ? (
        <div className="mt-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Enter your answer
          </label>
          <input
            type="number"
            className="w-44 rounded border-2 border-testline px-3 py-2 text-lg focus:border-testblue focus:outline-none"
            value={typeof answer === "number" ? answer : ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            aria-label="numeric answer"
          />
        </div>
      ) : question.questionType === "TEXT_COMPLETION" ? (
        <div className="mt-6 space-y-6">
          {blankGroups(question).map((g) => (
            <div key={g.blank}>
              {g.blank !== "single" && (
                <div className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                  Blank ({g.blank})
                </div>
              )}
              <div className="divide-y divide-testline rounded border border-testline">
                {g.choices.map((c) => (
                  <OvalRow
                    key={c.id}
                    picked={selected.includes(c.id)}
                    label={c.label}
                    onClick={() =>
                      g.blank === "single" ? toggleSingle(c.id) : toggleBlank(g.blank, c.id)
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          {question.questionType === "SENTENCE_EQUIVALENCE" && (
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Select exactly two answer choices</p>
          )}
          {question.questionType === "MULTIPLE_CHOICE_MULTIPLE" && (
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
              Consider each choice separately and select all that apply
            </p>
          )}
          <div className="divide-y divide-testline rounded border border-testline">
            {question.choices.map((c) => {
              const picked = selected.includes(c.id);
              if (question.questionType === "MULTIPLE_CHOICE_MULTIPLE") {
                return <SquareRow key={c.id} picked={picked} label={c.label} onClick={() => toggleMulti(c.id)} />;
              }
              const onClick =
                question.questionType === "SENTENCE_EQUIVALENCE" ? () => toggleSE(c.id) : () => toggleSingle(c.id);
              return <OvalRow key={c.id} picked={picked} label={c.label} onClick={onClick} />;
            })}
          </div>
        </div>
      )}
    </div>
  );

  // Reading Comprehension: split screen, passage left, question right.
  if (question.questionType === "READING_COMPREHENSION" && question.passageBodyHtml) {
    return (
      <div className="grid h-full grid-cols-2 gap-6">
        <div
          className="overflow-y-auto bg-white pr-4 text-[16px] leading-relaxed [&>p]:mb-4"
          dangerouslySetInnerHTML={{ __html: question.passageBodyHtml }}
        />
        <div className="overflow-y-auto border-l border-testline pl-6">{body}</div>
      </div>
    );
  }

  return <div className="mx-auto max-w-2xl">{body}</div>;
}
