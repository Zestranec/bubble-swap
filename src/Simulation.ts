import {
  BubbleId, MULTIPLIER_TABLES, SWAP_MULTIPLIER, CASHOUT_MULTIPLIER,
  TOTAL_TICKS,
} from './Config';
import { Rng } from './Rng';
import { generateRoundOutcome, isBubbleAlive, RoundOutcome } from './OutcomeController';

interface SimPlayerState {
  activeBubble: BubbleId;
  activeCapital: number;
  entryMultiplier: number;
}

function simCreatePlayer(bubble: BubbleId, bet: number): SimPlayerState {
  return {
    activeBubble: bubble,
    activeCapital: bet,
    entryMultiplier: MULTIPLIER_TABLES[bubble][0],
  };
}

function simGrossValue(state: SimPlayerState, tick: number): number {
  const table = MULTIPLIER_TABLES[state.activeBubble];
  const ct = Math.min(tick, table.length - 1);
  return state.activeCapital * (table[ct] / state.entryMultiplier);
}

function simSwap(state: SimPlayerState, target: BubbleId, tick: number): SimPlayerState {
  const gross = simGrossValue(state, tick);
  const capitalAfterFee = gross * SWAP_MULTIPLIER;
  const targetTable = MULTIPLIER_TABLES[target];
  const ct = Math.min(tick, targetTable.length - 1);
  return {
    activeBubble: target,
    activeCapital: capitalAfterFee,
    entryMultiplier: targetTable[ct],
  };
}

function simCashout(state: SimPlayerState, tick: number): number {
  return simGrossValue(state, tick) * CASHOUT_MULTIPLIER;
}

type BotAction = { type: 'cashout'; tick: number } | { type: 'swap'; tick: number; target: BubbleId };

interface BotStrategy {
  name: string;
  startBubble: BubbleId;
  actions: BotAction[];
}

const BOTS: BotStrategy[] = [
  {
    name: 'Safe Bot',
    startBubble: 'blue',
    actions: [
      { type: 'cashout', tick: 2 },
    ],
  },
  {
    name: 'Red Bot',
    startBubble: 'red',
    actions: [
      { type: 'cashout', tick: 1 },
    ],
  },
  {
    name: 'Swap Bot',
    startBubble: 'red',
    actions: [
      { type: 'swap', tick: 1, target: 'blue' },
      { type: 'cashout', tick: 2 },
    ],
  },
  {
    name: 'Greedy Bot',
    startBubble: 'red',
    actions: [
      { type: 'swap', tick: 1, target: 'yellow' },
      { type: 'swap', tick: 2, target: 'blue' },
      { type: 'cashout', tick: 3 },
    ],
  },
];

function simulateRound(outcome: RoundOutcome, strategy: BotStrategy, bet: number): number {
  let state = simCreatePlayer(strategy.startBubble, bet);

  for (const action of strategy.actions) {
    if (!isBubbleAlive(outcome, state.activeBubble, action.tick)) {
      return 0;
    }

    if (action.type === 'swap') {
      if (!isBubbleAlive(outcome, action.target, action.tick)) {
        continue;
      }
      state = simSwap(state, action.target, action.tick);
    } else if (action.type === 'cashout') {
      return simCashout(state, action.tick);
    }
  }

  for (let t = 0; t <= TOTAL_TICKS; t++) {
    if (!isBubbleAlive(outcome, state.activeBubble, t)) {
      return 0;
    }
  }
  return simCashout(state, TOTAL_TICKS);
}

function runSimulation(numRounds: number): void {
  console.log(`\n===== BUBBLE SWAP SIMULATION =====`);
  console.log(`Rounds per bot: ${numRounds.toLocaleString()}\n`);

  const masterRng = new Rng(42);

  for (const bot of BOTS) {
    let totalPayout = 0;
    let totalBet = 0;
    let wins = 0;
    const bet = 10;

    const botRng = new Rng((masterRng.next() * 0xffffffff) >>> 0);

    for (let i = 0; i < numRounds; i++) {
      const roundSeed = (botRng.next() * 0xffffffff) >>> 0;
      const roundRng = new Rng(roundSeed);
      const outcome = generateRoundOutcome(roundRng);
      const payout = simulateRound(outcome, bot, bet);
      totalPayout += payout;
      totalBet += bet;
      if (payout > 0) wins++;
    }

    const rtp = (totalPayout / totalBet) * 100;
    const avgPayout = totalPayout / numRounds;
    const winRate = (wins / numRounds) * 100;

    console.log(`--- ${bot.name} ---`);
    console.log(`  Start: ${bot.startBubble}`);
    console.log(`  Actions: ${bot.actions.map(a => a.type === 'cashout' ? `cashout@${a.tick}` : `swap→${a.target}@${a.tick}`).join(', ')}`);
    console.log(`  RTP: ${rtp.toFixed(2)}%`);
    console.log(`  Avg payout: $${avgPayout.toFixed(4)}`);
    console.log(`  Win rate: ${winRate.toFixed(2)}%`);
    console.log('');
  }
}

runSimulation(100_000);
