import { Application, Container, Graphics } from 'pixi.js';
import {
  BubbleId, BUBBLE_IDS, CANVAS_WIDTH, CANVAS_HEIGHT,
  TICK_DURATION_MS, TOTAL_TICKS, ACTION_LOCK_MS,
} from './Config';
import { GameStateMachine } from './GameStateMachine';
import { Rng } from './Rng';
import { RoundOutcome, generateRoundOutcome, isBubbleAlive, getAliveBubbles } from './OutcomeController';
import {
  PlayerState, createPlayerState, getCurrentGrossValue,
  getCurrentNetCashout, applySwap, calculateCashout,
} from './PayoutController';
import { BubbleView, FRAGMENT_LIFE_MS } from './BubbleView';
import { UIController } from './UIController';

const BUBBLE_POSITIONS: Record<BubbleId, { x: number; y: number }> = {
  blue: { x: CANVAS_WIDTH / 2 - 200, y: CANVAS_HEIGHT / 2 - 40 },
  yellow: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 - 40 },
  red: { x: CANVAS_WIDTH / 2 + 200, y: CANVAS_HEIGHT / 2 - 40 },
};

const RESOLVE_DURATION_MS = 2000;
const RESET_DURATION_MS = 300;

export class Game {
  private app: Application;
  private sm = new GameStateMachine();
  private rng: Rng;

  private bubbleViews: Map<BubbleId, BubbleView> = new Map();
  private bubbleLayer = new Container();
  private swapTrailLayer = new Container();
  private ui: UIController;

  private swapTrailTimers: Array<{ gfx: Graphics; life: number }> = [];

  private outcome: RoundOutcome | null = null;
  private playerState: PlayerState | null = null;

  private roundElapsedMs = 0;
  private currentTick = 0;
  private actionLockUntil = 0;
  private resolveTimer = 0;
  private resetTimer = 0;

  private debugMode = true;
  private roundHistory: string[] = [];
  private roundSeed = 0;
  private roundResolving = false;
  private pendingActiveLoss = false;
  private activeBurstTimer = 0;

  constructor(app: Application) {
    this.app = app;
    this.rng = Rng.fromSecureRandom();

    this.buildScene();
    this.ui = new UIController();
    app.stage.addChild(this.ui);

    this.wireCallbacks();
    this.sm.onStateChange((_from, to) => this.onStateChange(to));

    app.ticker.add(() => {
      const dt = app.ticker.deltaMS / 1000;
      this.update(dt);
    });
  }

  private buildScene(): void {
    const bg = new Graphics();
    bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    bg.fill({ color: 0x0a0a1a });
    this.app.stage.addChild(bg);

    this.app.stage.addChild(this.swapTrailLayer);
    this.app.stage.addChild(this.bubbleLayer);

    for (const id of BUBBLE_IDS) {
      const bv = new BubbleView(id);
      bv.x = BUBBLE_POSITIONS[id].x;
      bv.y = BUBBLE_POSITIONS[id].y;
      this.bubbleViews.set(id, bv);
      this.bubbleLayer.addChild(bv);
    }
  }

  private wireCallbacks(): void {
    this.ui.onStart = (bet, bubble) => this.startRound(bet, bubble);
    this.ui.onSwap = (target) => this.trySwap(target);
    this.ui.onCashout = () => this.tryCashout();
  }

  private onStateChange(to: string): void {
    if (to === 'idle') {
      this.ui.showIdleUI();
    }
  }

  private startRound(bet: number, startBubble: BubbleId): void {
    if (!this.sm.is('idle')) return;

    this.sm.transition('betting');

    this.roundSeed = (this.rng.next() * 0xffffffff) >>> 0;
    const roundRng = new Rng(this.roundSeed);
    this.outcome = generateRoundOutcome(roundRng);
    this.playerState = createPlayerState(startBubble, bet);

    this.roundElapsedMs = 0;
    this.currentTick = 0;
    this.actionLockUntil = 0;
    this.roundResolving = false;

    for (const id of BUBBLE_IDS) {
      this.bubbleViews.get(id)!.resetView();
      this.bubbleViews.get(id)!.setActive(id === startBubble);
    }

    this.sm.transition('running');
    this.ui.showRunningUI(startBubble);
  }

  private trySwap(target: BubbleId): void {
    if (this.roundResolving) return;
    if (!this.sm.is('running') || !this.outcome || !this.playerState) return;
    if (this.playerState.activeBubble === target) return;
    if (Date.now() < this.actionLockUntil) return;

    const tick = this.currentTick;

    if (!isBubbleAlive(this.outcome, this.playerState.activeBubble, tick)) return;
    if (!isBubbleAlive(this.outcome, target, tick)) return;

    this.actionLockUntil = Date.now() + ACTION_LOCK_MS;

    const fromBubble = this.playerState.activeBubble;
    this.playerState = applySwap(this.playerState, target, tick);

    this.bubbleViews.get(fromBubble)!.setActive(false);
    this.bubbleViews.get(target)!.setActive(true);

    this.showSwapTrail(fromBubble, target);

    const alive = getAliveBubbles(this.outcome, tick);
    this.ui.updateSwapButtons(target, alive);
  }

  private tryCashout(): void {
    if (this.roundResolving) return;
    if (!this.sm.is('running') || !this.outcome || !this.playerState) return;
    if (Date.now() < this.actionLockUntil) return;

    const tick = this.currentTick;
    if (!isBubbleAlive(this.outcome, this.playerState.activeBubble, tick)) return;

    this.actionLockUntil = Number.MAX_SAFE_INTEGER;
    const payout = calculateCashout(this.playerState, tick);
    this.resolveRound(true, payout);
  }

  private resolveRound(won: boolean, payout: number): void {
    if (this.roundResolving) return;
    this.roundResolving = true;
    console.log(`[Game] Resolve start — won=${won} payout=${payout.toFixed(2)}`);

    this.ui.lockAllInput();

    if (!this.sm.transition('resolve')) {
      console.warn('[Game] resolveRound: transition to resolve failed, forcing state');
    }

    this.ui.showResolveUI(won, payout);

    const result = won ? `WIN +$${payout.toFixed(2)}` : 'LOSS $0';
    this.roundHistory.unshift(`Seed:${this.roundSeed} ${result}`);
    if (this.roundHistory.length > 5) this.roundHistory.pop();
    this.ui.updateHistory(this.roundHistory.join('\n'));

    this.resolveTimer = RESOLVE_DURATION_MS;
  }

  private showSwapTrail(from: BubbleId, to: BubbleId): void {
    const fromPos = BUBBLE_POSITIONS[from];
    const toPos = BUBBLE_POSITIONS[to];

    const trail = new Graphics();
    trail.moveTo(fromPos.x, fromPos.y);
    trail.lineTo(toPos.x, toPos.y);
    trail.stroke({ color: 0xffffff, alpha: 0.6, width: 2 });
    this.swapTrailLayer.addChild(trail);

    this.swapTrailTimers.push({ gfx: trail, life: 400 });
  }

  private updateSwapTrails(dtMs: number): void {
    for (let i = this.swapTrailTimers.length - 1; i >= 0; i--) {
      const t = this.swapTrailTimers[i];
      t.life -= dtMs;
      t.gfx.alpha = Math.max(0, t.life / 400);
      if (t.life <= 0) {
        this.swapTrailLayer.removeChild(t.gfx);
        t.gfx.destroy();
        this.swapTrailTimers.splice(i, 1);
      }
    }
  }

  private update(dt: number): void {
    this.updateSwapTrails(dt * 1000);

    // Drive active burst animation and defer resolve until it completes.
    if (this.pendingActiveLoss && this.playerState) {
      const bv = this.bubbleViews.get(this.playerState.activeBubble)!;
      bv.tickUpdate(this.currentTick, dt);
      this.activeBurstTimer -= dt * 1000;
      if (this.activeBurstTimer <= 0) {
        this.pendingActiveLoss = false;
        console.log('[Game] Burst animation complete — resolving loss');
        this.resolveRound(false, 0);
      }
    }

    if (this.sm.is('running')) {
      this.updateRunning(dt);
    } else if (this.sm.is('resolve')) {
      // Keep any still-animating burst views alive during the resolve screen.
      for (const bv of this.bubbleViews.values()) {
        if (bv.isBurst) bv.tickUpdate(this.currentTick, dt);
      }
      this.resolveTimer -= dt * 1000;
      if (this.resolveTimer <= 0) {
        console.log('[Game] Reset scheduled');
        this.sm.transition('reset');
        this.resetTimer = RESET_DURATION_MS;
      }
    } else if (this.sm.is('reset')) {
      this.resetTimer -= dt * 1000;
      if (this.resetTimer <= 0) {
        this.performReset();
        this.sm.transition('idle');
      }
    }

    if (this.sm.is('idle')) {
      for (const bv of this.bubbleViews.values()) {
        bv.tickUpdate(0, dt);
      }
    }
  }

  private updateRunning(dt: number): void {
    if (!this.outcome || !this.playerState || this.roundResolving || this.pendingActiveLoss) return;

    this.roundElapsedMs += dt * 1000;
    const prevTick = this.currentTick;
    this.currentTick = Math.min(
      Math.floor(this.roundElapsedMs / TICK_DURATION_MS),
      TOTAL_TICKS
    );

    if (this.currentTick > prevTick) {
      for (let t = prevTick + 1; t <= this.currentTick; t++) {
        this.processTickEvents(t);
        if (this.roundResolving || this.pendingActiveLoss || !this.sm.is('running')) return;
      }
    }

    const interpProgress = (this.roundElapsedMs % TICK_DURATION_MS) / TICK_DURATION_MS;
    const visualTick = Math.min(this.currentTick + interpProgress, TOTAL_TICKS);
    const clampedIntTick = Math.min(Math.floor(visualTick), TOTAL_TICKS);

    for (const id of BUBBLE_IDS) {
      const bv = this.bubbleViews.get(id)!;
      if (!bv.isBurst) {
        bv.tickUpdate(clampedIntTick, dt);
      } else {
        bv.tickUpdate(this.currentTick, dt);
      }
    }

    if (!this.sm.is('running') || this.roundResolving || !this.playerState) return;

    const activeBubble = this.playerState.activeBubble;
    const activeAlive = isBubbleAlive(this.outcome, activeBubble, this.currentTick);

    if (!activeAlive) {
      this.resolveRound(false, 0);
      return;
    }

    const gross = getCurrentGrossValue(this.playerState, this.currentTick);
    const net = getCurrentNetCashout(this.playerState, this.currentTick);
    this.ui.updateValue(gross, net);

    const alive = getAliveBubbles(this.outcome, this.currentTick);
    this.ui.updateSwapButtons(activeBubble, alive);

    if (this.debugMode) {
      this.ui.updateDebug(
        `Tick: ${this.currentTick}/${TOTAL_TICKS}  Seed: ${this.roundSeed}\n` +
        `Crash: B=${this.outcome.blue.crashTick} Y=${this.outcome.yellow.crashTick} R=${this.outcome.red.crashTick}\n` +
        `Active: ${activeBubble}  Capital: $${this.playerState.activeCapital.toFixed(2)}\n` +
        `Gross: $${gross.toFixed(2)}`
      );
    }

    if (this.currentTick >= TOTAL_TICKS) {
      const payout = calculateCashout(this.playerState, this.currentTick);
      this.resolveRound(true, payout);
    }
  }

  private processTickEvents(tick: number): void {
    if (!this.outcome || !this.playerState) return;

    for (const id of BUBBLE_IDS) {
      if (tick >= this.outcome[id].crashTick) {
        const bv = this.bubbleViews.get(id)!;
        if (!bv.isBurst) {
          bv.burst();
          if (this.playerState.activeBubble === id) {
            console.log(`[Game] Active bubble burst detected: ${id}`);
            console.log(`[Game] Burst animation start — deferring resolve for ${FRAGMENT_LIFE_MS}ms`);
            // Lock input immediately but let the burst animation finish before resolving.
            this.actionLockUntil = Number.MAX_SAFE_INTEGER;
            this.pendingActiveLoss = true;
            this.activeBurstTimer = FRAGMENT_LIFE_MS;
            return;
          }
        }
      }
    }
  }

  private performReset(): void {
    console.log('[Game] Reset executed');
    this.pendingActiveLoss = false;
    this.activeBurstTimer = 0;
    for (const bv of this.bubbleViews.values()) {
      bv.resetView();
    }

    for (const t of this.swapTrailTimers) {
      this.swapTrailLayer.removeChild(t.gfx);
      t.gfx.destroy();
    }
    this.swapTrailTimers = [];

    this.outcome = null;
    this.playerState = null;
    this.roundElapsedMs = 0;
    this.currentTick = 0;
    this.roundResolving = false;
    this.ui.updateDebug('');
    this.ui.updateValue(0, 0);
  }
}
