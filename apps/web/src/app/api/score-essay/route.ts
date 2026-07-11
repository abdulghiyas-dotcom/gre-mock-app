import { NextResponse } from "next/server";

// AWA essay scoring. This is the ONE place an LLM runs at test time — it is a
// per-attempt judgment, not question generation. Runs server-side so the API
// key never reaches the client. Uses Claude Fable 5 with structured output;
// falls back to a transparent heuristic when no API key is configured, so the
// AWA flow works end-to-end without credentials.

interface Body {
  promptText: string;
  essayText: string;
}

const RUBRIC = `Score the essay on the GRE Analytical Writing 0-6 scale (half points allowed):
6 = cogent, well-articulated analysis with compelling support and fluent control of language.
5 = generally thoughtful analysis with well-chosen support and good control of language.
4 = competent analysis with adequate support and satisfactory control of language.
3 = some competence but with clear weaknesses in analysis, support, or clarity.
2 = seriously flawed analysis or control of language.
1 = fundamentally deficient.
0 = off-topic, non-verbal, or blank.
Weigh the quality of critical thinking and argumentation most heavily, not length.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "number" },
    feedback: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
  },
  required: ["score", "feedback", "strengths", "improvements"],
} as const;

async function scoreWithFable(promptText: string, essayText: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-06-01",
    },
    body: JSON.stringify({
      model: "claude-fable-5",
      max_tokens: 2000,
      // Fable 5 thinking is always-on; control depth via effort. Fall back to
      // Opus 4.8 if the classifier declines (rare for essay grading).
      fallbacks: [{ model: "claude-opus-4-8" }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: `You are an expert GRE Analytical Writing rater. ${RUBRIC} Return only the structured verdict.`,
      messages: [
        {
          role: "user",
          content: `Issue prompt:\n${promptText}\n\nTest-taker's essay:\n${essayText}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`scoring API ${res.status}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("scoring refused");
  const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text;
  return JSON.parse(text) as { score: number; feedback: string; strengths: string[]; improvements: string[] };
}

// Transparent heuristic used when ANTHROPIC_API_KEY is not set. Rewards
// development (length, paragraphing, connective structure) as a rough proxy —
// clearly NOT a substitute for the LLM rater; flagged as such in the response.
function heuristicScore(essayText: string) {
  const words = essayText.trim().split(/\s+/).filter(Boolean).length;
  const paragraphs = essayText.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  const connectives = (essayText.match(/\b(however|therefore|because|although|moreover|for example|in contrast|consequently)\b/gi) ?? []).length;

  let score = 1;
  if (words > 100) score = 2;
  if (words > 250) score = 3;
  if (words > 400 && paragraphs >= 3) score = 4;
  if (words > 500 && paragraphs >= 4 && connectives >= 4) score = 5;
  if (words > 600 && paragraphs >= 5 && connectives >= 6) score = 6;

  return {
    score,
    feedback:
      "Heuristic estimate (no LLM rater configured). This reflects length and structure only — set ANTHROPIC_API_KEY to get a rubric-based Fable 5 score.",
    strengths: paragraphs >= 3 ? ["Clear multi-paragraph structure"] : [],
    improvements:
      words < 400 ? ["Develop the argument further with specific examples"] : ["Deepen analysis of counterarguments"],
    heuristic: true as const,
  };
}

export async function POST(req: Request) {
  const { promptText, essayText } = (await req.json()) as Body;
  if (!essayText?.trim()) {
    return NextResponse.json({ score: 0, feedback: "No response submitted.", strengths: [], improvements: [] });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return NextResponse.json(await scoreWithFable(promptText, essayText));
    } catch (err) {
      // Fall through to heuristic so a scoring outage never blocks the result screen.
      return NextResponse.json({ ...heuristicScore(essayText), error: (err as Error).message });
    }
  }
  return NextResponse.json(heuristicScore(essayText));
}
