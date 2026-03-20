import { BubbleId } from './Config';
import { MIN_CRASH_MS_BY_BUBBLE, MAX_ROUND_MS } from './Config';
import { Rng } from './Rng';

// ---- Types ----

export type GrowthProfileId =
  | 'blue_smooth_1'
  | 'blue_smooth_2'
  | 'blue_delayed_1'
  | 'yellow_balanced_1'
  | 'yellow_balanced_2'
  | 'yellow_jumpy_1'
  | 'yellow_delayed_spike_1'
  | 'red_explosive_1'
  | 'red_explosive_2'
  | 'red_early_spike_1'
  | 'red_unstable_1';

export type VisualStyle = 'smooth' | 'delayed' | 'jumpy' | 'explosive' | 'unstable' | 'spike';

export interface GrowthProfile {
  id: GrowthProfileId;
  bubbleId: BubbleId;
  phase1EndSec: number;
  phase2EndSec: number;
  earlyLinear: number;
  earlyQuad: number;
  midLinear: number;
  midQuad: number;
  lateLinear: number;
  lateQuad: number;
  softCapSec: number;
  maxVisualMultiplier: number;
  visualStyle: VisualStyle;
}

// ---- Profile definitions ----

export const PROFILES: Record<GrowthProfileId, GrowthProfile> = {
  blue_smooth_1: {
    id: 'blue_smooth_1', bubbleId: 'blue',
    phase1EndSec: 3.0, phase2EndSec: 8.0,
    earlyLinear: 0.0144, earlyQuad: 0.0005,
    midLinear: 0.0323,   midQuad: 0.0019,
    lateLinear: 0.0598,  lateQuad: 0.0044,
    softCapSec: 16.0, maxVisualMultiplier: 3.20, visualStyle: 'smooth',
  },
  blue_smooth_2: {
    id: 'blue_smooth_2', bubbleId: 'blue',
    phase1EndSec: 2.5, phase2EndSec: 7.5,
    earlyLinear: 0.0162, earlyQuad: 0.0006,
    midLinear: 0.0347,   midQuad: 0.0024,
    lateLinear: 0.0634,  lateQuad: 0.0053,
    softCapSec: 15.0, maxVisualMultiplier: 3.45, visualStyle: 'smooth',
  },
  blue_delayed_1: {
    id: 'blue_delayed_1', bubbleId: 'blue',
    phase1EndSec: 4.0, phase2EndSec: 8.5,
    earlyLinear: 0.0090, earlyQuad: 0.0003,
    midLinear: 0.0391,   midQuad: 0.0029,
    lateLinear: 0.0728,  lateQuad: 0.0066,
    softCapSec: 16.5, maxVisualMultiplier: 3.60, visualStyle: 'delayed',
  },

  yellow_balanced_1: {
    id: 'yellow_balanced_1', bubbleId: 'yellow',
    phase1EndSec: 2.8, phase2EndSec: 7.0,
    earlyLinear: 0.0198, earlyQuad: 0.0010,
    midLinear: 0.0442,   midQuad: 0.0036,
    lateLinear: 0.0806,  lateQuad: 0.0079,
    softCapSec: 14.0, maxVisualMultiplier: 4.30, visualStyle: 'smooth',
  },
  yellow_balanced_2: {
    id: 'yellow_balanced_2', bubbleId: 'yellow',
    phase1EndSec: 2.4, phase2EndSec: 6.5,
    earlyLinear: 0.0225, earlyQuad: 0.0010,
    midLinear: 0.0493,   midQuad: 0.0043,
    lateLinear: 0.0884,  lateQuad: 0.0097,
    softCapSec: 13.0, maxVisualMultiplier: 4.70, visualStyle: 'smooth',
  },
  yellow_jumpy_1: {
    id: 'yellow_jumpy_1', bubbleId: 'yellow',
    phase1EndSec: 2.0, phase2EndSec: 6.0,
    earlyLinear: 0.0243, earlyQuad: 0.0013,
    midLinear: 0.0510,   midQuad: 0.0053,
    lateLinear: 0.0858,  lateQuad: 0.0123,
    softCapSec: 12.0, maxVisualMultiplier: 5.00, visualStyle: 'jumpy',
  },
  yellow_delayed_spike_1: {
    id: 'yellow_delayed_spike_1', bubbleId: 'yellow',
    phase1EndSec: 3.5, phase2EndSec: 7.5,
    earlyLinear: 0.0144, earlyQuad: 0.0006,
    midLinear: 0.0527,   midQuad: 0.0048,
    lateLinear: 0.1014,  lateQuad: 0.0123,
    softCapSec: 13.5, maxVisualMultiplier: 5.20, visualStyle: 'spike',
  },

  red_explosive_1: {
    id: 'red_explosive_1', bubbleId: 'red',
    phase1EndSec: 1.8, phase2EndSec: 4.8,
    earlyLinear: 0.0342, earlyQuad: 0.0022,
    midLinear: 0.0714,   midQuad: 0.0084,
    lateLinear: 0.1222,  lateQuad: 0.0176,
    softCapSec: 10.5, maxVisualMultiplier: 6.80, visualStyle: 'explosive',
  },
  red_explosive_2: {
    id: 'red_explosive_2', bubbleId: 'red',
    phase1EndSec: 1.5, phase2EndSec: 4.2,
    earlyLinear: 0.0396, earlyQuad: 0.0026,
    midLinear: 0.0782,   midQuad: 0.0096,
    lateLinear: 0.1274,  lateQuad: 0.0220,
    softCapSec: 9.5, maxVisualMultiplier: 7.30, visualStyle: 'explosive',
  },
  red_early_spike_1: {
    id: 'red_early_spike_1', bubbleId: 'red',
    phase1EndSec: 1.2, phase2EndSec: 3.8,
    earlyLinear: 0.0468, earlyQuad: 0.0032,
    midLinear: 0.0629,   midQuad: 0.0072,
    lateLinear: 0.1066,  lateQuad: 0.0154,
    softCapSec: 9.0, maxVisualMultiplier: 6.50, visualStyle: 'spike',
  },
  red_unstable_1: {
    id: 'red_unstable_1', bubbleId: 'red',
    phase1EndSec: 1.7, phase2EndSec: 4.5,
    earlyLinear: 0.0369, earlyQuad: 0.0024,
    midLinear: 0.0765,   midQuad: 0.0101,
    lateLinear: 0.1118,  lateQuad: 0.0264,
    softCapSec: 10.0, maxVisualMultiplier: 7.00, visualStyle: 'unstable',
  },
};

// ---- Weighted selection helper ----

interface WeightedItem<T> {
  weight: number;
  value: T;
}

function pickWeighted<T>(rng: Rng, items: WeightedItem<T>[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng.next() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

/** Like pickWeighted but for objects that ARE the value (e.g. CrashBand). */
function pickWeightedObj<T extends { weight: number }>(rng: Rng, items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng.next() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// ---- Profile pools (weighted per bubble) ----

const PROFILE_POOLS: Record<BubbleId, WeightedItem<GrowthProfileId>[]> = {
  blue: [
    { weight: 0.42, value: 'blue_smooth_1' },
    { weight: 0.38, value: 'blue_smooth_2' },
    { weight: 0.20, value: 'blue_delayed_1' },
  ],
  yellow: [
    { weight: 0.30, value: 'yellow_balanced_1' },
    { weight: 0.28, value: 'yellow_balanced_2' },
    { weight: 0.22, value: 'yellow_jumpy_1' },
    { weight: 0.20, value: 'yellow_delayed_spike_1' },
  ],
  red: [
    { weight: 0.34, value: 'red_explosive_1' },
    { weight: 0.26, value: 'red_explosive_2' },
    { weight: 0.22, value: 'red_early_spike_1' },
    { weight: 0.18, value: 'red_unstable_1' },
  ],
};

// ---- Crash bands (weighted per bubble, in ms) ----

interface CrashBand {
  weight: number;
  minMs: number;
  maxMs: number;
}

const CRASH_BANDS: Record<BubbleId, CrashBand[]> = {
  blue: [
    { weight: 0.12, minMs:  4500, maxMs:  6500 },
    { weight: 0.43, minMs:  6200, maxMs:  9500 },
    { weight: 0.30, minMs:  9500, maxMs: 12800 },
    { weight: 0.15, minMs: 13500, maxMs: 17000 },
  ],
  yellow: [
    { weight: 0.20, minMs:  3500, maxMs:  5500 },
    { weight: 0.34, minMs:  5500, maxMs:  8500 },
    { weight: 0.30, minMs:  8500, maxMs: 12000 },
    { weight: 0.16, minMs: 12000, maxMs: 16000 },
  ],
  red: [
    { weight: 0.34, minMs:  1400, maxMs:  3800 },
    { weight: 0.34, minMs:  3800, maxMs:  7000 },
    { weight: 0.22, minMs:  7000, maxMs: 10000 },
    { weight: 0.10, minMs: 10000, maxMs: 14000 },
  ],
};

// ---- Profile-specific crash adjustments ----
// Returns a delta in ms to add to the raw crash time.

type AdjustFn = (rng: Rng) => number;

const CRASH_ADJUSTMENTS: Record<GrowthProfileId, AdjustFn> = {
  blue_smooth_1:          ()    =>    0,
  blue_smooth_2:          ()    => -250,
  blue_delayed_1:         ()    => +500,
  yellow_balanced_1:      ()    =>    0,
  yellow_balanced_2:      ()    => -150,
  yellow_jumpy_1:         (rng) => (rng.next() - 0.5) * 900,   // ±450 ms
  yellow_delayed_spike_1: ()    => +300,
  red_explosive_1:        ()    => -250,
  red_explosive_2:        ()    => -450,
  red_early_spike_1:      ()    => -550,
  red_unstable_1:         (rng) => (rng.next() - 0.5) * 1000,  // ±500 ms
};

// ---- Profile evaluation ----

/**
 * Piecewise-quadratic continuous multiplier.
 * Phase boundaries are C0-continuous by construction (each phase seeds off
 * the previous phase's endpoint value).
 * Result is clamped to [1.0, profile.maxVisualMultiplier].
 */
export function evaluateProfile(profileId: GrowthProfileId, elapsedMs: number): number {
  const p = PROFILES[profileId];
  const t = elapsedMs / 1000;

  let value: number;

  if (t <= p.phase1EndSec) {
    value = 1 + p.earlyLinear * t + p.earlyQuad * t * t;
  } else {
    const p1 = p.phase1EndSec;
    const phase1Value = 1 + p.earlyLinear * p1 + p.earlyQuad * p1 * p1;

    if (t <= p.phase2EndSec) {
      const local = t - p1;
      value = phase1Value + p.midLinear * local + p.midQuad * local * local;
    } else {
      const p2 = p.phase2EndSec;
      const local1 = p2 - p1;
      const phase2Value = phase1Value + p.midLinear * local1 + p.midQuad * local1 * local1;
      const local2 = t - p2;
      value = phase2Value + p.lateLinear * local2 + p.lateQuad * local2 * local2;
    }
  }

  return Math.max(1.0, Math.min(p.maxVisualMultiplier, value));
}

// ---- Per-bubble outcome generation ----

export interface GeneratedBubbleOutcome {
  profileId: GrowthProfileId;
  crashTimeMs: number;
}

export function generateBubbleOutcome(rng: Rng, bubbleId: BubbleId): GeneratedBubbleOutcome {
  const profileId = pickWeighted(rng, PROFILE_POOLS[bubbleId]);
  const band      = pickWeightedObj(rng, CRASH_BANDS[bubbleId]);

  // Uniform roll within the selected crash band.
  const rawCrashMs = band.minMs + rng.next() * (band.maxMs - band.minMs);

  // Profile-specific adjustment (may consume an extra rng.next() for variance profiles).
  const adjustFn   = CRASH_ADJUSTMENTS[profileId];
  const adjustment = adjustFn(rng);

  const minCrash = MIN_CRASH_MS_BY_BUBBLE[bubbleId];
  const crashTimeMs = Math.max(minCrash, Math.min(MAX_ROUND_MS, rawCrashMs + adjustment));

  return { profileId, crashTimeMs };
}
