import { BubbleId, SWAP_MULTIPLIER, CASHOUT_MULTIPLIER } from './Config';
import { GrowthProfileId, evaluateProfile } from './GrowthProfiles';
import { RoundOutcome } from './OutcomeController';

export interface ActivePosition {
  bubbleId: BubbleId;
  enteredCapital: number;
  /** Round-elapsed ms at which the player entered this bubble (0 for round start). */
  entryTimeMs: number;
  /** Profile multiplier at the moment of entry — used as the divisor in value formula. */
  entryMultiplier: number;
}

/**
 * Create the starting position for a round.
 * evaluateProfile at t=0 always returns 1.0, so entryMultiplier = 1.0.
 */
export function createActivePosition(
  bubble: BubbleId,
  bet: number,
  outcome: RoundOutcome,
): ActivePosition {
  return {
    bubbleId:        bubble,
    enteredCapital:  bet,
    entryTimeMs:     0,
    entryMultiplier: evaluateProfile(outcome[bubble].profileId, 0),
  };
}

/**
 * Gross value = enteredCapital × (currentMultiplier / entryMultiplier).
 * entryMultiplier is the multiplier at the time the player entered the bubble.
 */
export function getCurrentGrossValue(
  pos: ActivePosition,
  outcome: RoundOutcome,
  elapsedMs: number,
): number {
  const currentMultiplier = evaluateProfile(
    outcome[pos.bubbleId].profileId as GrowthProfileId,
    elapsedMs,
  );
  return pos.enteredCapital * (currentMultiplier / pos.entryMultiplier);
}

export function getCurrentNetCashout(
  pos: ActivePosition,
  outcome: RoundOutcome,
  elapsedMs: number,
): number {
  return getCurrentGrossValue(pos, outcome, elapsedMs) * CASHOUT_MULTIPLIER;
}

/**
 * Swap from the current bubble to targetBubble at nowMs.
 * 1. Compute gross value in current bubble.
 * 2. Apply swap fee (×0.97).
 * 3. Enter target bubble at target's current multiplier.
 */
export function applySwap(
  pos: ActivePosition,
  targetBubble: BubbleId,
  outcome: RoundOutcome,
  nowMs: number,
): ActivePosition {
  const grossBeforeSwap  = getCurrentGrossValue(pos, outcome, nowMs);
  const capitalAfterFee  = Math.round(grossBeforeSwap * SWAP_MULTIPLIER * 100) / 100;
  const entryMultiplier  = evaluateProfile(outcome[targetBubble].profileId, nowMs);
  return {
    bubbleId:        targetBubble,
    enteredCapital:  capitalAfterFee,
    entryTimeMs:     nowMs,
    entryMultiplier,
  };
}

export function calculateCashout(
  pos: ActivePosition,
  outcome: RoundOutcome,
  nowMs: number,
): number {
  return getCurrentNetCashout(pos, outcome, nowMs);
}
