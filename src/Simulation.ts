/**
 * Bubble Swap – Simulation
 * Tests 8 bot strategies using the continuous-time math model.
 * Run with:  npm run simulate
 */

import { BubbleId, BUBBLE_IDS, SWAP_MULTIPLIER, CASHOUT_MULTIPLIER } from './Config';
import { Rng } from './Rng';
import { generateRoundOutcome, isBubbleAlive, RoundOutcome } from './OutcomeController';
import { GrowthProfileId, evaluateProfile } from './GrowthProfiles';

// ---- Inline simulation math (mirrors PayoutController, no Pixi dependency) ----

interface SimPos {
  bubbleId:        BubbleId;
  enteredCapital:  number;
  entryMultiplier: number;
}

function simCreate(bubble: BubbleId, bet: number, outcome: RoundOutcome): SimPos {
  return {
    bubbleId:        bubble,
    enteredCapital:  bet,
    entryMultiplier: evaluateProfile(outcome[bubble].profileId as GrowthProfileId, 0),
  };
}

function simGross(pos: SimPos, outcome: RoundOutcome, nowMs: number): number {
  const currentMult = evaluateProfile(outcome[pos.bubbleId].profileId as GrowthProfileId, nowMs);
  return pos.enteredCapital * (currentMult / pos.entryMultiplier);
}

function simSwap(pos: SimPos, target: BubbleId, outcome: RoundOutcome, nowMs: number): SimPos {
  const gross        = simGross(pos, outcome, nowMs);
  const capital      = gross * SWAP_MULTIPLIER;
  const entryMult    = evaluateProfile(outcome[target].profileId as GrowthProfileId, nowMs);
  return { bubbleId: target, enteredCapital: capital, entryMultiplier: entryMult };
}

function simCashout(pos: SimPos, outcome: RoundOutcome, nowMs: number): number {
  return simGross(pos, outcome, nowMs) * CASHOUT_MULTIPLIER;
}

// ---- Action types ----

type BotAction =
  | { type: 'cashout';       timeMs: number }
  | { type: 'swap';          timeMs: number; target: BubbleId }
  | { type: 'adaptive_swap'; timeMs: number; candidates: BubbleId[] };

interface BotStrategy {
  name:        string;
  startBubble: BubbleId;
  actions:     BotAction[];
}

// ---- 8 Bot strategies ----

const BOTS: BotStrategy[] = [
  {
    // 1. Blue Safe: start blue, cashout at 6 s, no swap
    name: 'Blue Safe',
    startBubble: 'blue',
    actions: [
      { type: 'cashout', timeMs: 6000 },
    ],
  },
  {
    // 2. Yellow Safe: start yellow, cashout at 5.5 s, no swap
    name: 'Yellow Safe',
    startBubble: 'yellow',
    actions: [
      { type: 'cashout', timeMs: 5500 },
    ],
  },
  {
    // 3. Red Snap: start red, cashout at 3 s, no swap
    name: 'Red Snap',
    startBubble: 'red',
    actions: [
      { type: 'cashout', timeMs: 3000 },
    ],
  },
  {
    // 4. Red→Blue: start red, swap to blue at 2.8 s, cashout at 6.5 s
    name: 'Red→Blue',
    startBubble: 'red',
    actions: [
      { type: 'swap',    timeMs: 2800, target: 'blue' },
      { type: 'cashout', timeMs: 6500 },
    ],
  },
  {
    // 5. Red→Yellow: start red, swap to yellow at 2.5 s, cashout at 5.8 s
    name: 'Red→Yellow',
    startBubble: 'red',
    actions: [
      { type: 'swap',    timeMs: 2500, target: 'yellow' },
      { type: 'cashout', timeMs: 5800 },
    ],
  },
  {
    // 6. Yellow→Blue: start yellow, swap to blue at 4.5 s, cashout at 8 s
    name: 'Yellow→Blue',
    startBubble: 'yellow',
    actions: [
      { type: 'swap',    timeMs: 4500, target: 'blue' },
      { type: 'cashout', timeMs: 8000 },
    ],
  },
  {
    // 7. Greedy Red: start red, hold until 4.5 s, cashout if alive
    name: 'Greedy Red',
    startBubble: 'red',
    actions: [
      { type: 'cashout', timeMs: 4500 },
    ],
  },
  {
    // 8. Adaptive Simple: start red, at 2.5 s swap to highest-value alive bubble
    //    among yellow/blue, then cashout at 6 s.
    name: 'Adaptive Simple',
    startBubble: 'red',
    actions: [
      { type: 'adaptive_swap', timeMs: 2500, candidates: ['yellow', 'blue'] },
      { type: 'cashout',       timeMs: 6000 },
    ],
  },
];

// ---- Round simulation ----

interface RoundResult {
  payout:    number;
  numSwaps:  number;
  bustedEarly: boolean; // lost before reaching the first cashout time
}

function simulateRound(outcome: RoundOutcome, strategy: BotStrategy, bet: number): RoundResult {
  let pos       = simCreate(strategy.startBubble, bet, outcome);
  let numSwaps  = 0;
  let firstCashoutTimeMs = Infinity;

  // Find time of first planned cashout (for bust-before-cashout tracking).
  for (const a of strategy.actions) {
    if (a.type === 'cashout') { firstCashoutTimeMs = a.timeMs; break; }
  }

  for (const action of strategy.actions) {
    const nowMs = action.timeMs;

    // Active bubble burst check (deterministic priority: burst > swap/cashout).
    if (!isBubbleAlive(outcome, pos.bubbleId, nowMs)) {
      return { payout: 0, numSwaps, bustedEarly: nowMs <= firstCashoutTimeMs };
    }

    if (action.type === 'swap') {
      if (!isBubbleAlive(outcome, action.target, nowMs)) continue; // target dead, skip swap
      pos = simSwap(pos, action.target, outcome, nowMs);
      numSwaps++;
    } else if (action.type === 'adaptive_swap') {
      // Pick candidate with the highest current multiplier (visible value).
      let bestTarget: BubbleId | null = null;
      let bestMult = -Infinity;
      for (const candidate of action.candidates) {
        if (!isBubbleAlive(outcome, candidate, nowMs)) continue;
        if (candidate === pos.bubbleId) continue;
        const m = evaluateProfile(outcome[candidate].profileId as GrowthProfileId, nowMs);
        if (m > bestMult) { bestMult = m; bestTarget = candidate; }
      }
      if (bestTarget) {
        pos = simSwap(pos, bestTarget, outcome, nowMs);
        numSwaps++;
      }
    } else if (action.type === 'cashout') {
      return { payout: simCashout(pos, outcome, nowMs), numSwaps, bustedEarly: false };
    }
  }

  // No cashout action triggered — check if alive at round end.
  const endMs = Infinity; // hold forever
  if (!isBubbleAlive(outcome, pos.bubbleId, endMs)) {
    return { payout: 0, numSwaps, bustedEarly: false };
  }
  // Should not reach here in normal bots, but handle gracefully.
  return { payout: 0, numSwaps, bustedEarly: false };
}

// ---- Runner ----

function runSimulation(numRounds: number): void {
  console.log(`\n===== BUBBLE SWAP SIMULATION (continuous-time model) =====`);
  console.log(`Rounds per bot: ${numRounds.toLocaleString()}\n`);

  const masterRng = new Rng(42);

  for (const bot of BOTS) {
    let totalPayout  = 0;
    let totalBet     = 0;
    let wins         = 0;
    let bustedEarly  = 0;
    let totalSwaps   = 0;
    const bet        = 10;

    const botRng = new Rng((masterRng.next() * 0xffffffff) >>> 0);

    for (let i = 0; i < numRounds; i++) {
      const roundSeed = (botRng.next() * 0xffffffff) >>> 0;
      const roundRng  = new Rng(roundSeed);
      const outcome   = generateRoundOutcome(roundRng);
      const result    = simulateRound(outcome, bot, bet);

      totalPayout += result.payout;
      totalBet    += bet;
      totalSwaps  += result.numSwaps;
      if (result.payout > 0)       wins++;
      if (result.bustedEarly)      bustedEarly++;
    }

    const rtp      = (totalPayout / totalBet) * 100;
    const avgPayout = totalPayout / numRounds;
    const winRate   = (wins / numRounds) * 100;
    const bustRate  = (bustedEarly / numRounds) * 100;
    const avgSwaps  = totalSwaps / numRounds;

    console.log(`--- ${bot.name} ---`);
    console.log(`  Start: ${bot.startBubble}`);
    console.log(`  Actions: ${bot.actions.map(a =>
      a.type === 'cashout'       ? `cashout@${a.timeMs}ms` :
      a.type === 'swap'          ? `swap→${(a as { target: BubbleId }).target}@${a.timeMs}ms` :
                                   `adaptive_swap@${a.timeMs}ms`
    ).join(', ')}`);
    console.log(`  RTP:              ${rtp.toFixed(2)}%`);
    console.log(`  Avg payout:       $${avgPayout.toFixed(4)}`);
    console.log(`  Win rate:         ${winRate.toFixed(2)}%`);
    console.log(`  Bust before cash: ${bustRate.toFixed(2)}%`);
    console.log(`  Avg swaps/round:  ${avgSwaps.toFixed(3)}`);
    console.log('');
  }

  // Also print crash-time distribution sanity check for first 10 bubbles of a fixed seed.
  console.log('--- Outcome sample (seed 1234, first 5 rounds) ---');
  const sampleRng = new Rng(1234);
  for (let i = 0; i < 5; i++) {
    const seed   = (sampleRng.next() * 0xffffffff) >>> 0;
    const o      = generateRoundOutcome(new Rng(seed));
    const ids    = BUBBLE_IDS as BubbleId[];
    const line   = ids.map(id => `${id}:${o[id].crashTimeMs.toFixed(0)}ms(${o[id].profileId})`).join('  ');
    console.log(`  Round ${i + 1}: ${line}`);
  }
}

runSimulation(100_000);
