import type { Difficulty, SectionType } from "./types";

// Raw -> scaled (130-170) conversion, keyed by which difficulty the adaptive
// SECOND section was administered at (see docs/SCORING_ENGINE.md §2). This
// reproduces GRE score equating: two test-takers with the same raw total get
// different scaled scores if one faced a harder Section 2. The curve is a
// hand-authored monotonic stand-in per tier — replace the endpoints with an
// empirically-calibrated table once real user p-values exist.
//
// Each entry is [scaledAtRawZero, scaledAtRawMax]; intermediate raw scores are
// linearly interpolated. Note the tier differences:
//   HARD  second section -> highest ceiling (170) and a raised floor
//   EASY  second section -> capped ceiling (you can't reach 170 off an easy pool)
const CURVE: Record<Difficulty, [number, number]> = {
  HARD: [133, 170],
  MEDIUM: [131, 166],
  EASY: [130, 158],
};

export function scaledFromRaw(
  rawTotal: number,
  maxTotal: number,
  secondSectionLevel: Difficulty,
): number {
  const [lo, hi] = CURVE[secondSectionLevel];
  const frac = maxTotal > 0 ? Math.min(1, Math.max(0, rawTotal / maxTotal)) : 0;
  return Math.round(lo + frac * (hi - lo));
}

// Non-adaptive practice tests have no routed second section; treat them as MEDIUM.
export function scaledForPractice(_section: SectionType, rawTotal: number, maxTotal: number): number {
  return scaledFromRaw(rawTotal, maxTotal, "MEDIUM");
}
