export type BubbleId = 'blue' | 'yellow' | 'red';

export const BUBBLE_IDS: BubbleId[] = ['blue', 'yellow', 'red'];

export const TICK_DURATION_MS = 500;
export const TOTAL_TICKS = 12;
export const MAX_ROUND_DURATION_MS = TOTAL_TICKS * TICK_DURATION_MS;

export const SWAP_FEE = 0.03;
export const CASHOUT_FEE = 0.05;
export const SWAP_MULTIPLIER = 1 - SWAP_FEE;
export const CASHOUT_MULTIPLIER = 1 - CASHOUT_FEE;

export const ACTION_LOCK_MS = 150;

export const MULTIPLIER_TABLES: Record<BubbleId, number[]> = {
  blue: [1.0000, 1.0570, 1.1235, 1.1995, 1.2850, 1.3800, 1.4845, 1.5985, 1.7220, 1.8550, 1.9975, 2.1495, 2.3110],
  yellow: [1.0000, 1.0855, 1.1805, 1.2945, 1.4180, 1.5510, 1.7030, 1.8645, 2.0355, 2.2160, 2.4060, 2.6055, 2.8145],
  red: [1.0000, 1.1330, 1.2850, 1.4560, 1.6555, 1.8740, 2.1210, 2.3870, 2.6815, 3.0045, 3.3560, 3.7360, 4.1445],
};

export const HAZARD_TABLES: Record<BubbleId, number[]> = {
  blue: [0.0405, 0.0540, 0.0675, 0.0810, 0.1080, 0.1350, 0.1620, 0.1890, 0.2430, 0.2970, 0.3780, 0.4725],
  yellow: [0.0675, 0.0810, 0.1080, 0.1350, 0.1755, 0.2160, 0.2700, 0.3375, 0.4185, 0.5130, 0.6210, 0.7425],
  red: [0.0945, 0.1215, 0.1620, 0.2025, 0.2700, 0.3510, 0.4455, 0.5535, 0.6750, 0.8100, 0.9720, 0.9800],
};

export const BUBBLE_COLORS: Record<BubbleId, number> = {
  blue: 0x3b82f6,
  yellow: 0xeab308,
  red: 0xef4444,
};

export const BUBBLE_LABELS: Record<BubbleId, string> = {
  blue: 'BLUE',
  yellow: 'YELLOW',
  red: 'RED',
};

export const CANVAS_WIDTH = 900;
export const CANVAS_HEIGHT = 600;
export const DEFAULT_BET = 10;
