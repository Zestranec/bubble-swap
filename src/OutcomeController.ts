import { BubbleId, BUBBLE_IDS } from './Config';
import { Rng } from './Rng';
import { GrowthProfileId, generateBubbleOutcome } from './GrowthProfiles';

export interface BubbleOutcome {
  bubbleId: BubbleId;
  profileId: GrowthProfileId;
  /** Bubble bursts when elapsedMs >= crashTimeMs. */
  crashTimeMs: number;
}

export interface RoundOutcome {
  blue:   BubbleOutcome;
  yellow: BubbleOutcome;
  red:    BubbleOutcome;
}

/** Generate a fully deterministic round outcome before animation begins. */
export function generateRoundOutcome(rng: Rng): RoundOutcome {
  const outcome: Partial<RoundOutcome> = {};
  for (const id of BUBBLE_IDS) {
    const { profileId, crashTimeMs } = generateBubbleOutcome(rng, id);
    outcome[id] = { bubbleId: id, profileId, crashTimeMs };
  }
  return outcome as RoundOutcome;
}

export function isBubbleAlive(outcome: RoundOutcome, id: BubbleId, elapsedMs: number): boolean {
  return elapsedMs < outcome[id].crashTimeMs;
}

export function getAliveBubbles(outcome: RoundOutcome, elapsedMs: number): BubbleId[] {
  return BUBBLE_IDS.filter(id => isBubbleAlive(outcome, id, elapsedMs));
}
