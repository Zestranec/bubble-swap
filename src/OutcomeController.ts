import { BubbleId, BUBBLE_IDS, HAZARD_TABLES, TOTAL_TICKS } from './Config';
import { Rng } from './Rng';

export interface BubbleOutcome {
  /** Bubble bursts when currentTick >= crashTick. TOTAL_TICKS + 1 means survives all ticks. */
  crashTick: number;
}

export interface RoundOutcome {
  blue: BubbleOutcome;
  yellow: BubbleOutcome;
  red: BubbleOutcome;
}

/**
 * Generate a crash tick for a single bubble using its hazard table.
 * Iterates intervals 0..11. For each interval i, if rng.next() < hazard[i],
 * the bubble crashes at tick (i + 1). If it survives all intervals,
 * crashTick = TOTAL_TICKS + 1 (never crashes).
 */
function generateCrashTick(rng: Rng, hazardTable: number[]): number {
  for (let i = 0; i < hazardTable.length; i++) {
    const roll = rng.next();
    if (roll < hazardTable[i]) {
      return i + 1;
    }
  }
  return TOTAL_TICKS + 1;
}

export function generateRoundOutcome(rng: Rng): RoundOutcome {
  const outcome: Partial<RoundOutcome> = {};
  for (const id of BUBBLE_IDS) {
    outcome[id] = { crashTick: generateCrashTick(rng, HAZARD_TABLES[id]) };
  }
  return outcome as RoundOutcome;
}

export function isBubbleAlive(outcome: RoundOutcome, id: BubbleId, tick: number): boolean {
  return tick < outcome[id].crashTick;
}

export function getAliveBubbles(outcome: RoundOutcome, tick: number): BubbleId[] {
  return BUBBLE_IDS.filter(id => isBubbleAlive(outcome, id, tick));
}
