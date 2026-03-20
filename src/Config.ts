export type BubbleId = 'blue' | 'yellow' | 'red';

export const BUBBLE_IDS: BubbleId[] = ['blue', 'yellow', 'red'];

// ---- Round timing ----
export const MIN_CRASH_MS_BY_BUBBLE: Record<BubbleId, number> = {
  blue:   2200,
  yellow: 1500,
  red:     600,
};
export const MAX_ROUND_MS = 18000;

// ---- Resolve timings ----
export const POST_BURST_RESOLVE_DELAY_MS  = 900;
export const POST_CASHOUT_RESOLVE_DELAY_MS = 700;

// ---- Fees ----
export const SWAP_FEE         = 0.03;
export const CASHOUT_FEE      = 0.05;
export const SWAP_MULTIPLIER  = 1 - SWAP_FEE;
export const CASHOUT_MULTIPLIER = 1 - CASHOUT_FEE;

export const ACTION_LOCK_MS = 150;

// ---- Visual / UI ----
export const BUBBLE_COLORS: Record<BubbleId, number> = {
  blue:   0x3b82f6,
  yellow: 0xeab308,
  red:    0xef4444,
};

export const BUBBLE_LABELS: Record<BubbleId, string> = {
  blue:   'BLUE',
  yellow: 'YELLOW',
  red:    'RED',
};

export const CANVAS_WIDTH  = 900;
export const CANVAS_HEIGHT = 600;
export const DEFAULT_BET   = 10;
