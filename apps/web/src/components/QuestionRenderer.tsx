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

  const body = (
    <div>
      <p className="whitespace-pre-line text-[17px] leading-relaxed">{question.stem}</p>

      {question.questionType === "NUMERIC_ENTRY" ? (
        <div className="mt-6">
          <input
            type="number"
            className="w-40 rounded border border-testline px-3 py-2 text-lg"
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
              <div className="space-y-2">
                {g.choices.map((c) => {
                  const picked = selected.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        g.blank === "single" ? toggleSingle(c.id) : toggleBlank(g.blank, c.id)
                      }
                      className={`block w-full rounded border px-4 py-2 text-left ${
                        picked ? "border-testblue bg-blue-50" : "border-testline bg-white hover:bg-neutral-50"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {question.questionType === "SENTENCE_EQUIVALENCE" && (
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Select exactly two</p>
          )}
          {question.questionType === "MULTIPLE_CHOICE_MULTIPLE" && (
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
              Select all that apply
            </p>
          )}
          {question.choices.map((c) => {
            const picked = selected.includes(c.id);
            const handler =
              question.questionType === "SENTENCE_EQUIVALENCE"
                ? () => toggleSE(c.id)
                : question.questionType === "MULTIPLE_CHOICE_MULTIPLE"
                  ? () => toggleMulti(c.id)
                  : () => toggleSingle(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={handler}
                className={`flex w-full items-start gap-3 rounded border px-4 py-2 text-left ${
                  picked ? "border-testblue bg-blue-50" : "border-testline bg-white hover:bg-neutral-50"
                }`}
              >
                <span className="mt-0.5 font-mono text-sm text-neutral-500">{c.id}</span>
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // Reading Comprehension: split screen, passage left, question right.
  if (question.questionType === "READING_COMPREHENSION" && question.passageBodyHtml) {
    return (
      <div className="grid h-full grid-cols-2 gap-6">
        <div
          className="overflow-y-auto pr-4 text-[16px] leading-relaxed [&>p]:mb-4"
          dangerouslySetInnerHTML={{ __html: question.passageBodyHtml }}
        />
        <div className="overflow-y-auto border-l border-testline pl-6">{body}</div>
      </div>
    );
  }

  return <div className="mx-auto max-w-2xl">{body}</div>;
}
