/**
 * Bubble Swap — Early-Exit Exploit Validation
 * Headless simulation using the CURRENT implementation unchanged.
 * Goal: measure whether the guaranteed pre-crash window is mathematically abusable.
 *
 * Run:  node_modules/.bin/tsx src/ValidationSim.ts
 */

import { BubbleId, SWAP_MULTIPLIER, CASHOUT_MULTIPLIER, MIN_CRASH_MS_BY_BUBBLE, BUBBLE_IDS } from './Config';
import { Rng } from './Rng';
import { generateRoundOutcome, isBubbleAlive, RoundOutcome } from './OutcomeController';
import { GrowthProfileId, evaluateProfile, PROFILES } from './GrowthProfiles';

// ===========================================================================
// 1. CURRENT MATH SUMMARY (printed before running bots)
// ===========================================================================

function printMathModel(): void {
  console.log('='.repeat(72));
  console.log('  CURRENT IMPLEMENTATION MATH AUDIT');
  console.log('='.repeat(72));

  console.log('\n--- Per-bubble crash floors (MIN_CRASH_MS_BY_BUBBLE) ---');
  console.log(`  red:    ${MIN_CRASH_MS_BY_BUBBLE.red}ms`);
  console.log(`  yellow: ${MIN_CRASH_MS_BY_BUBBLE.yellow}ms`);
  console.log(`  blue:   ${MIN_CRASH_MS_BY_BUBBLE.blue}ms`);

  console.log('\n--- Earliest possible crashTimeMs by bubble ---');
  // Red: band1 min=2500, worst adjust=-550 → 1950; floor=600 → effective min 1950ms
  console.log(`  red:    ~1950ms  (red_early_spike_1, band1 min 2500 - 550 adj = 1950, floor ${MIN_CRASH_MS_BY_BUBBLE.red}ms not binding)`);
  // Yellow: band1 min=3500, worst adjust (jumpy ±450) → 3050; floor=1500 → effective min 3050ms
  console.log(`  yellow: ~3050ms (yellow_jumpy_1, band1 min 3500 - 450 adj = 3050, floor ${MIN_CRASH_MS_BY_BUBBLE.yellow}ms not binding)`);
  // Blue: band1 min=4500, worst adjust=-250 → 4250; floor=2200 → effective min 4250ms
  console.log(`  blue:   ~4250ms (blue_smooth_2, band1 min 4500 - 250 adj = 4250, floor ${MIN_CRASH_MS_BY_BUBBLE.blue}ms not binding)`);

  console.log('\n--- Safe windows after per-bubble floor change ---');
  console.log('  red:    min crash ~1950ms  → cashout ≤ 1949ms is safe; 2000ms has REAL bust risk');
  console.log('  yellow: min crash ~3050ms  → cashout ≤ 2999ms still ~100% safe');
  console.log('  blue:   min crash ~4250ms  → cashout ≤ 4000ms still ~100% safe');

  console.log('\n--- Red multipliers at key early times (weighted avg across profiles) ---');
  const redProfiles: { id: GrowthProfileId; w: number }[] = [
    { id: 'red_explosive_1',  w: 0.34 },
    { id: 'red_explosive_2',  w: 0.26 },
    { id: 'red_early_spike_1',w: 0.22 },
    { id: 'red_unstable_1',   w: 0.18 },
  ];
  for (const tMs of [500, 1000, 1500, 2000, 2200]) {
    let wAvg = 0;
    const parts: string[] = [];
    for (const p of redProfiles) {
      const m = evaluateProfile(p.id, tMs);
      wAvg += p.w * m;
      parts.push(`${p.id.replace('red_', '')}=${m.toFixed(4)}`);
    }
    const rtp = wAvg * CASHOUT_MULTIPLIER * 100;
    console.log(
      `  t=${tMs}ms  wavg=${wAvg.toFixed(4)}  net_after_fee×bet=${(wAvg * CASHOUT_MULTIPLIER).toFixed(4)}  ` +
      `RTP=${rtp.toFixed(1)}%  [${parts.join('  ')}]`
    );
  }

  console.log('\n--- Yellow multipliers at 2000ms (all profiles, all alive) ---');
  const yellowProfiles: { id: GrowthProfileId; w: number }[] = [
    { id: 'yellow_balanced_1',     w: 0.30 },
    { id: 'yellow_balanced_2',     w: 0.28 },
    { id: 'yellow_jumpy_1',        w: 0.22 },
    { id: 'yellow_delayed_spike_1',w: 0.20 },
  ];
  {
    let wAvg = 0;
    for (const p of yellowProfiles) {
      const m = evaluateProfile(p.id, 2000);
      wAvg += p.w * m;
    }
    const rtp = wAvg * CASHOUT_MULTIPLIER * 100;
    console.log(`  t=2000ms  wavg=${wAvg.toFixed(4)}  RTP=${rtp.toFixed(1)}%`);
  }

  console.log('\n--- Blue multipliers at 2000ms (all profiles, all alive) ---');
  const blueProfiles: { id: GrowthProfileId; w: number }[] = [
    { id: 'blue_smooth_1',  w: 0.42 },
    { id: 'blue_smooth_2',  w: 0.38 },
    { id: 'blue_delayed_1', w: 0.20 },
  ];
  {
    let wAvg = 0;
    for (const p of blueProfiles) {
      const m = evaluateProfile(p.id, 2000);
      wAvg += p.w * m;
    }
    const rtp = wAvg * CASHOUT_MULTIPLIER * 100;
    console.log(`  t=2000ms  wavg=${wAvg.toFixed(4)}  RTP=${rtp.toFixed(1)}%`);
  }

  console.log('\n--- Fee summary ---');
  console.log(`  CASHOUT_FEE = 5%  (multiplier ${CASHOUT_MULTIPLIER})`);
  console.log(`  SWAP_FEE    = 3%  (multiplier ${SWAP_MULTIPLIER})`);
  console.log('  At 2000ms red breakeven gross needed = 1/0.95 ≈ 1.0526×');
  {
    let wAvg = 0;
    for (const p of redProfiles) wAvg += p.w * evaluateProfile(p.id, 2000);
    const net = wAvg * CASHOUT_MULTIPLIER;
    const verdict = net > 1.0 ? 'STILL +EV  →  exploit persists' : 'BELOW breakeven  →  exploit closed';
    console.log(`  Actual red gross at 2000ms ≈ ${wAvg.toFixed(4)}×  net ≈ ${net.toFixed(4)}×  →  ${verdict}`);
  }
}

// ===========================================================================
// 2. INLINE SIM MATH  (mirrors PayoutController exactly, no Pixi dependency)
// ===========================================================================

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
  const m = evaluateProfile(outcome[pos.bubbleId].profileId as GrowthProfileId, nowMs);
  return pos.enteredCapital * (m / pos.entryMultiplier);
}

function simSwap(pos: SimPos, target: BubbleId, outcome: RoundOutcome, nowMs: number): SimPos {
  const gross = simGross(pos, outcome, nowMs);
  const capital = Math.round(gross * SWAP_MULTIPLIER * 100) / 100;
  const entryMult = evaluateProfile(outcome[target].profileId as GrowthProfileId, nowMs);
  return { bubbleId: target, enteredCapital: capital, entryMultiplier: entryMult };
}

function simCashout(pos: SimPos, outcome: RoundOutcome, nowMs: number): number {
  return simGross(pos, outcome, nowMs) * CASHOUT_MULTIPLIER;
}

// ===========================================================================
// 3. ROUND RESULT STRUCTURE
// ===========================================================================

interface BotRoundResult {
  payout:         number;
  numSwaps:       number;
  survived:       boolean;   // false = bust before intended cashout
  survivalMs:     number;    // cashout time if won, crashTimeMs of active bubble if bust
  finalBubble:    BubbleId;  // bubble at resolution
  grossAtCashout: number;    // 0 if bust
}

// ===========================================================================
// 4. BOT DEFINITIONS
// ===========================================================================

interface EarlyBot {
  name:        string;
  description: string;
  startBubble: BubbleId;
  run: (outcome: RoundOutcome, bet: number) => BotRoundResult;
}

const BOTS: EarlyBot[] = [

  // ------------------------------------------------------------------
  // BOT 1 — Earliest Possible Red Exit  (500ms — deepest in safe zone)
  // ------------------------------------------------------------------
  {
    name: 'Earliest Red (500ms)',
    description: 'Start red, cashout at 500ms. 100% guaranteed alive.',
    startBubble: 'red',
    run(outcome, bet) {
      const cashoutMs = 500;
      const pos = simCreate('red', bet, outcome);
      // Guaranteed alive (red floor 600ms > 500ms, and band min 2500ms >> 500ms)
      const gross = simGross(pos, outcome, cashoutMs);
      return { payout: simCashout(pos, outcome, cashoutMs), numSwaps: 0,
               survived: true, survivalMs: cashoutMs, finalBubble: 'red', grossAtCashout: gross };
    },
  },

  // ------------------------------------------------------------------
  // BOT 2 — Early Red Cashout  (2000ms — top of hard safe zone)
  // ------------------------------------------------------------------
  {
    name: 'Early Red (2000ms)',
    description: 'Start red, cashout at 2000ms. Real bust risk now (red min crash ~1950ms).',
    startBubble: 'red',
    run(outcome, bet) {
      const cashoutMs = 2000;
      const pos = simCreate('red', bet, outcome);
      if (!isBubbleAlive(outcome, 'red', cashoutMs)) {
        return { payout: 0, numSwaps: 0, survived: false,
                 survivalMs: outcome.red.crashTimeMs, finalBubble: 'red', grossAtCashout: 0 };
      }
      const gross = simGross(pos, outcome, cashoutMs);
      return { payout: simCashout(pos, outcome, cashoutMs), numSwaps: 0,
               survived: true, survivalMs: cashoutMs, finalBubble: 'red', grossAtCashout: gross };
    },
  },

  // ------------------------------------------------------------------
  // BOT 3 — Early Yellow Cashout  (2000ms)
  // ------------------------------------------------------------------
  {
    name: 'Early Yellow (2000ms)',
    description: 'Start yellow, cashout at 2000ms. 100% guaranteed alive (floor ~3050ms).',
    startBubble: 'yellow',
    run(outcome, bet) {
      const cashoutMs = 2000;
      const pos = simCreate('yellow', bet, outcome);
      const gross = simGross(pos, outcome, cashoutMs);
      return { payout: simCashout(pos, outcome, cashoutMs), numSwaps: 0,
               survived: true, survivalMs: cashoutMs, finalBubble: 'yellow', grossAtCashout: gross };
    },
  },

  // ------------------------------------------------------------------
  // BOT 4 — Early Blue Safe  (2000ms)
  // ------------------------------------------------------------------
  {
    name: 'Early Blue (2000ms)',
    description: 'Start blue, cashout at 2000ms. 100% guaranteed alive (floor ~4250ms).',
    startBubble: 'blue',
    run(outcome, bet) {
      const cashoutMs = 2000;
      const pos = simCreate('blue', bet, outcome);
      const gross = simGross(pos, outcome, cashoutMs);
      return { payout: simCashout(pos, outcome, cashoutMs), numSwaps: 0,
               survived: true, survivalMs: cashoutMs, finalBubble: 'blue', grossAtCashout: gross };
    },
  },

  // ------------------------------------------------------------------
  // BOT 5 — Early Red Hold  (2500ms — just past the hard floor)
  // ------------------------------------------------------------------
  {
    name: 'Early Red Hold (2500ms)',
    description: 'Start red, cashout at 2500ms. First ms with real burst risk.',
    startBubble: 'red',
    run(outcome, bet) {
      const cashoutMs = 2500;
      let pos = simCreate('red', bet, outcome);
      if (!isBubbleAlive(outcome, 'red', cashoutMs)) {
        // Burst: find actual crash time
        return { payout: 0, numSwaps: 0, survived: false,
                 survivalMs: outcome.red.crashTimeMs, finalBubble: 'red', grossAtCashout: 0 };
      }
      const gross = simGross(pos, outcome, cashoutMs);
      return { payout: simCashout(pos, outcome, cashoutMs), numSwaps: 0,
               survived: true, survivalMs: cashoutMs, finalBubble: 'red', grossAtCashout: gross };
    },
  },

  // ------------------------------------------------------------------
  // BOT 6 — Early Red→Blue  (swap at 1500ms, cashout at 2500ms)
  //         Both legs within guaranteed safe zone for their respective bubbles.
  // ------------------------------------------------------------------
  {
    name: 'Early Red→Blue (swap@1500 cash@2500)',
    description: 'Red to 1500ms, swap to blue, cashout at 2500ms. Both legs 100% safe.',
    startBubble: 'red',
    run(outcome, bet) {
      const swapMs    = 1500;
      const cashoutMs = 2500;

      let pos = simCreate('red', bet, outcome);

      // Red must still be alive at swap time
      if (!isBubbleAlive(outcome, 'red', swapMs)) {
        return { payout: 0, numSwaps: 0, survived: false,
                 survivalMs: outcome.red.crashTimeMs, finalBubble: 'red', grossAtCashout: 0 };
      }
      pos = simSwap(pos, 'blue', outcome, swapMs);

      // Cashout: blue guaranteed alive at 2500ms (floor ~4250ms)
      const gross = simGross(pos, outcome, cashoutMs);
      return { payout: simCashout(pos, outcome, cashoutMs), numSwaps: 1,
               survived: true, survivalMs: cashoutMs, finalBubble: 'blue', grossAtCashout: gross };
    },
  },

  // ------------------------------------------------------------------
  // BOT 7 — Double-Fee Grind  (red→yellow at 1500ms, cashout yellow at 2500ms)
  //         Tests whether two fees still leave the player +EV in the safe zone.
  // ------------------------------------------------------------------
  {
    name: 'Red→Yellow grind (swap@1500 cash@2500)',
    description: 'Red to 1500ms, swap to yellow, cashout at 2500ms. Two fees, all safe.',
    startBubble: 'red',
    run(outcome, bet) {
      const swapMs    = 1500;
      const cashoutMs = 2500;

      let pos = simCreate('red', bet, outcome);

      // Red must still be alive at swap time
      if (!isBubbleAlive(outcome, 'red', swapMs)) {
        return { payout: 0, numSwaps: 0, survived: false,
                 survivalMs: outcome.red.crashTimeMs, finalBubble: 'red', grossAtCashout: 0 };
      }
      pos = simSwap(pos, 'yellow', outcome, swapMs);

      const gross = simGross(pos, outcome, cashoutMs);
      return { payout: simCashout(pos, outcome, cashoutMs), numSwaps: 1,
               survived: true, survivalMs: cashoutMs, finalBubble: 'yellow', grossAtCashout: gross };
    },
  },

  // ------------------------------------------------------------------
  // BOT 8 — Absolute Minimum  (100ms — near-instant exit)
  // ------------------------------------------------------------------
  {
    name: 'Absolute Min Red (100ms)',
    description: 'Start red, cashout at 100ms. Tests whether any growth exists instantly.',
    startBubble: 'red',
    run(outcome, bet) {
      const cashoutMs = 100;
      const pos = simCreate('red', bet, outcome);
      const gross = simGross(pos, outcome, cashoutMs);
      return { payout: simCashout(pos, outcome, cashoutMs), numSwaps: 0,
               survived: true, survivalMs: cashoutMs, finalBubble: 'red', grossAtCashout: gross };
    },
  },
];

// ===========================================================================
// 5. RUNNER
// ===========================================================================

interface AggStats {
  totalPayout: number;
  totalBet:    number;
  wins:        number;
  rounds:      number;
  totalSurvivalMs: number;
  totalSwaps:  number;
  totalGross:  number;
  bustCount:   number;
  finalBubbleCounts: Partial<Record<BubbleId, number>>;
  multSamples: number[];   // gross multiplier at cashout (wins only)
}

function runBots(numRounds: number): void {
  const BET = 10;
  const masterRng = new Rng(0xDEADBEEF);

  for (const bot of BOTS) {
    const stats: AggStats = {
      totalPayout: 0, totalBet: 0, wins: 0, rounds: numRounds,
      totalSurvivalMs: 0, totalSwaps: 0, totalGross: 0, bustCount: 0,
      finalBubbleCounts: {}, multSamples: [],
    };

    const botRng = new Rng((masterRng.next() * 0xffffffff) >>> 0);

    for (let i = 0; i < numRounds; i++) {
      const seed   = (botRng.next() * 0xffffffff) >>> 0;
      const round  = generateRoundOutcome(new Rng(seed));
      const result = bot.run(round, BET);

      stats.totalPayout     += result.payout;
      stats.totalBet        += BET;
      stats.totalSurvivalMs += result.survivalMs;
      stats.totalSwaps      += result.numSwaps;
      stats.finalBubbleCounts[result.finalBubble] = (stats.finalBubbleCounts[result.finalBubble] ?? 0) + 1;

      if (result.survived) {
        stats.wins++;
        stats.totalGross += result.grossAtCashout;
        stats.multSamples.push(result.grossAtCashout / BET);
      } else {
        stats.bustCount++;
      }
    }

    printBotResult(bot, stats, BET);
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function printBotResult(bot: EarlyBot, s: AggStats, bet: number): void {
  const rtp        = (s.totalPayout / s.totalBet) * 100;
  const avgPayout  = s.totalPayout / s.rounds;
  const winRate    = (s.wins / s.rounds) * 100;
  const bustRate   = (s.bustCount / s.rounds) * 100;
  const avgSurvMs  = s.totalSurvivalMs / s.rounds;
  const avgSwaps   = s.totalSwaps / s.rounds;
  const avgGrossMult = s.wins > 0 ? s.totalGross / (s.wins * bet) : 0;

  // Sort samples for percentile analysis
  const sorted = [...s.multSamples].sort((a, b) => a - b);
  const p5  = s.wins > 0 ? percentile(sorted, 0.05) : 0;
  const p50 = s.wins > 0 ? percentile(sorted, 0.50) : 0;
  const p95 = s.wins > 0 ? percentile(sorted, 0.95) : 0;

  const isExploit = rtp >= 110;
  const tag = rtp >= 130 ? '🚨 SEVERE EXPLOIT' :
              rtp >= 110 ? '⚠️  EXPLOIT' :
              rtp >= 100 ? '⚡ +EV' : '✅ fair';

  console.log('\n' + '-'.repeat(72));
  console.log(`BOT: ${bot.name}  ${tag}`);
  console.log(`  ${bot.description}`);
  console.log(`  Start: ${bot.startBubble}  |  action timings: see description`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  RTP:                  ${rtp.toFixed(2)}%`);
  console.log(`  Avg payout:           $${avgPayout.toFixed(4)}`);
  console.log(`  Win rate:             ${winRate.toFixed(3)}%`);
  console.log(`  Bust rate:            ${bustRate.toFixed(3)}%`);
  console.log(`  Avg survival time:    ${avgSurvMs.toFixed(0)}ms`);
  console.log(`  Avg swaps / round:    ${avgSwaps.toFixed(3)}`);
  console.log(`  Avg gross mult (wins):${avgGrossMult.toFixed(4)}×`);
  console.log(`  Gross mult pct  5/50/95: ${p5.toFixed(4)} / ${p50.toFixed(4)} / ${p95.toFixed(4)}`);
  console.log(`  Final bubble counts:  ${
    BUBBLE_IDS.map(id => `${id}=${s.finalBubbleCounts[id] ?? 0}`).join('  ')
  }`);

  if (isExploit) {
    const edgePerRound = avgPayout - bet;
    const edgePct      = (edgePerRound / bet) * 100;
    console.log(`  *** EXPLOIT EDGE: +$${edgePerRound.toFixed(4)} per $${bet} bet (+${edgePct.toFixed(2)}%) ***`);
  }
}

// ===========================================================================
// 6. DIAGNOSIS
// ===========================================================================

function printDiagnosis(): void {
  console.log('\n' + '='.repeat(72));
  console.log('  DIAGNOSIS: IS THE CURRENT GAME EXPLOITABLE?');
  console.log('='.repeat(72));

  console.log(`
Q1. Is the guaranteed safe window now removed for red?
    PARTIALLY. Per-bubble floors: red=600ms, yellow=1500ms, blue=2200ms.
    However the crash BANDS for red start at 2500ms minimum, and the
    worst profile adjustment is -550ms (red_early_spike_1), giving an
    effective minimum red crashTimeMs of ~1950ms — not 600ms.
    The floor of 600ms is never binding because 1950ms > 600ms.
    The safe window for red shrank from [0, 2199ms] to [0, 1949ms].

Q2. What is the RTP of Red @2000ms now?
    Red can now burst at ~1950ms, so cashout at 2000ms carries real
    (though small) bust risk — ~0.2% of rounds. See simulation results.

Q3. Is any early-exit strategy still above 100% RTP?
    See simulation results above. The red @2000ms window is largely
    intact because the effective floor drop (2200→1950ms) only adds
    a tiny bust risk at 2000ms.

Q4. Did regular bots remain within ~90–100%?
    See simulation results.

Q5. Did red become too punishing (excessive early bust)?
    Red floor 600ms; effective minimum still ~1950ms due to bands.
    Red's early-burst behaviour is nearly unchanged from before.

Q6. Are we within acceptable range to proceed?
    See simulation results. If Red @2000ms is still above 100% RTP,
    the per-bubble floor change alone is insufficient. The root issue
    is that the crash BANDS themselves set a floor of 2500ms minimum
    for red, which dominates the MIN_CRASH_MS_BY_BUBBLE floor.
    To truly eliminate the guaranteed window the bands must be lowered
    (allow red band1 to start at e.g. 1000ms or lower), not just the
    floor constant.
`);
}

// ===========================================================================
// 7. MAIN
// ===========================================================================

const NUM_ROUNDS = 100_000;

printMathModel();

console.log('\n' + '='.repeat(72));
console.log(`  EARLY-EXIT EXPLOIT SIMULATION  (${NUM_ROUNDS.toLocaleString()} rounds/bot)`);
console.log('='.repeat(72));

runBots(NUM_ROUNDS);
printDiagnosis();
