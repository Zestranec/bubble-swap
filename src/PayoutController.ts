import {
  BubbleId,
  MULTIPLIER_TABLES,
  SWAP_MULTIPLIER,
  CASHOUT_MULTIPLIER,
} from './Config';

export interface PlayerState {
  activeBubble: BubbleId;
  activeCapital: number;
  entryTick: number;
  entryMultiplier: number;
}

export function createPlayerState(bubble: BubbleId, bet: number): PlayerState {
  return {
    activeBubble: bubble,
    activeCapital: bet,
    entryTick: 0,
    entryMultiplier: MULTIPLIER_TABLES[bubble][0],
  };
}

export function getCurrentGrossValue(state: PlayerState, currentTick: number): number {
  const table = MULTIPLIER_TABLES[state.activeBubble];
  const clampedTick = Math.min(currentTick, table.length - 1);
  const currentMultiplier = table[clampedTick];
  return state.activeCapital * (currentMultiplier / state.entryMultiplier);
}

export function getCurrentNetCashout(state: PlayerState, currentTick: number): number {
  return getCurrentGrossValue(state, currentTick) * CASHOUT_MULTIPLIER;
}

export function applySwap(state: PlayerState, targetBubble: BubbleId, currentTick: number): PlayerState {
  const grossBeforeSwap = getCurrentGrossValue(state, currentTick);
  const capitalAfterFee = grossBeforeSwap * SWAP_MULTIPLIER;
  const targetTable = MULTIPLIER_TABLES[targetBubble];
  const clampedTick = Math.min(currentTick, targetTable.length - 1);
  return {
    activeBubble: targetBubble,
    activeCapital: capitalAfterFee,
    entryTick: currentTick,
    entryMultiplier: targetTable[clampedTick],
  };
}

export function calculateCashout(state: PlayerState, currentTick: number): number {
  return getCurrentNetCashout(state, currentTick);
}
