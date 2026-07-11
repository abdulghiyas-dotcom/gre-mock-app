"use client";

interface Props {
  promptText: string;
  value: string;
  onChange: (v: string) => void;
}

// Deliberately minimal, matching the restricted ETS essay editor: plain text,
// a live word count, no rich formatting. Cut/copy/paste are the browser's.
export function AwaEditor({ promptText, value, onChange }: Props) {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div className="mx-auto grid h-full max-w-5xl grid-rows-[auto_1fr] gap-4">
      <div className="rounded border border-testline bg-white p-4">
        <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Issue Task</div>
        <p className="whitespace-pre-line text-[15px] leading-relaxed">{promptText}</p>
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="mb-1 flex justify-between text-xs text-neutral-500">
          <span>Type your response below.</span>
          <span>{words} words</span>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded border border-testline bg-white p-4 font-mono text-[15px] leading-relaxed focus:border-testblue focus:outline-none"
          placeholder="Begin your essay here..."
        />
      </div>
    </div>
  );
}
