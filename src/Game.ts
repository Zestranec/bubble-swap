import { Application, Container, Graphics } from 'pixi.js';
import {
  BubbleId, BUBBLE_IDS, BUBBLE_COLORS, CANVAS_WIDTH, CANVAS_HEIGHT,
  ACTION_LOCK_MS, MAX_ROUND_MS, LOBBY_DURATION_MS,
  POST_BURST_RESOLVE_DELAY_MS, POST_CASHOUT_RESOLVE_DELAY_MS,
} from './Config';
import { GameStateMachine } from './GameStateMachine';
import { Rng } from './Rng';
import { RoundOutcome, generateRoundOutcome, isBubbleAlive } from './OutcomeController';
import {
  ActivePosition, createActivePosition, getCurrentGrossValue,
  getCurrentNetCashout, applySwap, calculateCashout,
} from './PayoutController';
import { BubbleView, FRAGMENT_LIFE_MS } from './BubbleView';
import { UIController } from './UIController';
import { EffectLayer } from './EffectLayer';

const BUBBLE_POSITIONS: Record<BubbleId, { x: number; y: number }> = {
  blue:   { x: 130, y: 265 },
  yellow: { x: 300, y: 265 },
  red:    { x: 215, y: 415 },
};

const RESET_DURATION_MS = 300;

const INTRO_FULL_TEXT =
  'Да уж, надо было вложиться в биткоин в 2010...\n' +
  'Теперь уже поздно конечно.\n' +
  'Пойду вложусь в какой-нибудь пузырь.';

const INTRO_CHAR_INTERVAL_MS = 45;

// Screen shake constants
const SHAKE_STRENGTH_ACTIVE  = 8;
const SHAKE_DECAY_PER_SEC    = 0.94; // multiplied per frame at 60fps equivalent

export class Game {
  private app: Application;
  private sm  = new GameStateMachine();
  private rng: Rng;

  // All game-world visuals grouped so screen shake applies uniformly
  private gameWorldLayer = new Container();
  private bubbleViews: Map<BubbleId, BubbleView> = new Map();
  private bubbleLayer    = new Container();
  private swapTrailLayer = new Container();
  private effectLayer    = new EffectLayer();

  private ui: UIController;

  private swapTrailTimers: Array<{ gfx: Graphics; life: number }> = [];

  private outcome:     RoundOutcome | null   = null;
  private playerState: ActivePosition | null = null;

  private roundElapsedMs  = 0;
  private actionLockUntil = 0;
  private resolveTimer    = 0;
  private resetTimer      = 0;
  private lobbyTimer      = 0;
  private introElapsed    = 0;
  private introComplete   = false;

  private lobbySelectedBubble: BubbleId | null = null;

  // Screen shake state
  private _shakeStrength = 0;
  private _shakeTime     = 0;

  private debugMode    = true;
  private roundHistory: string[] = [];
  private roundSeed    = 0;

  private roundResolving   = false;
  private pendingActiveLoss = false;
  private activeBurstTimer  = 0;

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

  // ---- Scene setup ----

  private buildScene(): void {
    const bg = new Graphics();
    bg.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    bg.fill({ color: 0x0a0a1a });
    this.app.stage.addChild(bg);

    // gameWorldLayer groups all in-world visuals for uniform screen shake
    this.gameWorldLayer.addChild(this.swapTrailLayer);
    this.gameWorldLayer.addChild(this.bubbleLayer);
    this.gameWorldLayer.addChild(this.effectLayer);
    this.app.stage.addChild(this.gameWorldLayer);

    for (const id of BUBBLE_IDS) {
      const bv = new BubbleView(id);
      bv.x = BUBBLE_POSITIONS[id].x;
      bv.y = BUBBLE_POSITIONS[id].y;
      bv.onTap = (tappedId) => this.onBubbleClick(tappedId);
      this.bubbleViews.set(id, bv);
      this.bubbleLayer.addChild(bv);
    }
  }

  private wireCallbacks(): void {
    this.ui.onIntroComplete = () => this.sm.transition('lobby');
  }

  private onStateChange(to: string): void {
    if (to === 'lobby') {
      this.lobbyTimer          = LOBBY_DURATION_MS;
      this.lobbySelectedBubble = null;
      for (const bv of this.bubbleViews.values()) bv.setLobbyHighlight(false);
      this.ui.showLobbyUI();
      this.ui.updateLobbyProgress(this.lobbyTimer, LOBBY_DURATION_MS);
    }
  }

  // ---- Bubble click router ----

  private onBubbleClick(id: BubbleId): void {
    if (this.sm.is('lobby')) {
      this.onBubbleClickLobby(id);
    } else if (this.sm.is('running')) {
      if (this.playerState?.bubbleId === id) {
        this.tryCashout();
      } else {
        this.trySwap(id);
      }
    }
  }

  private onBubbleClickLobby(id: BubbleId): void {
    this.lobbySelectedBubble = id;
    for (const bv of this.bubbleViews.values()) {
      bv.setLobbyHighlight(bv.id === id);
    }
    this.ui.updateLobbyHint(id);
  }

  // ---- Round lifecycle ----

  private startRound(startBubble: BubbleId): void {
    if (!this.sm.is('lobby')) return;

    this.sm.transition('betting');

    this.roundSeed   = (this.rng.next() * 0xffffffff) >>> 0;
    const roundRng   = new Rng(this.roundSeed);
    this.outcome     = generateRoundOutcome(roundRng);
    this.playerState = createActivePosition(startBubble, this.ui.bet, this.outcome);

    this.roundElapsedMs    = 0;
    this.actionLockUntil   = 0;
    this.roundResolving    = false;
    this.pendingActiveLoss = false;
    this.activeBurstTimer  = 0;

    for (const id of BUBBLE_IDS) {
      const bv = this.bubbleViews.get(id)!;
      bv.resetView();
      bv.setActive(id === startBubble);
      bv.setCollectVisible(id === startBubble);
      bv.setProfile(this.outcome[id].profileId);
      bv.setCrashTime(this.outcome[id].crashTimeMs);  // drives pre-crash warning
    }

    this.sm.transition('running');
    this.ui.showRunningUI();
  }

  private trySwap(target: BubbleId): void {
    if (this.roundResolving || this.pendingActiveLoss) return;
    if (!this.sm.is('running') || !this.outcome || !this.playerState) return;
    if (this.playerState.bubbleId === target) return;
    if (Date.now() < this.actionLockUntil) return;

    const nowMs = this.roundElapsedMs;
    if (!isBubbleAlive(this.outcome, this.playerState.bubbleId, nowMs)) return;
    if (!isBubbleAlive(this.outcome, target, nowMs)) return;

    this.actionLockUntil = Date.now() + ACTION_LOCK_MS;

    const fromBubble = this.playerState.bubbleId;
    this.playerState = applySwap(this.playerState, target, this.outcome, nowMs);

    this.bubbleViews.get(fromBubble)!.setActive(false);
    this.bubbleViews.get(fromBubble)!.setCollectVisible(false);
    this.bubbleViews.get(target)!.setActive(true);
    this.bubbleViews.get(target)!.setCollectVisible(true);

    this.showSwapTrail(fromBubble, target);

    // Spawn money-transfer particle animation
    const fromPos     = BUBBLE_POSITIONS[fromBubble];
    const toPos       = BUBBLE_POSITIONS[target];
    const sourceColor = BUBBLE_COLORS[fromBubble];
    const targetView  = this.bubbleViews.get(target)!;
    console.log(`[FX] Swap transfer: ${fromBubble} → ${target}`);
    this.effectLayer.spawnSwapTransfer(
      fromPos.x, fromPos.y,
      toPos.x,   toPos.y,
      sourceColor,
      () => targetView.triggerArrivalFlash(),
    );
  }

  private tryCashout(): void {
    if (this.roundResolving || this.pendingActiveLoss) return;
    if (!this.sm.is('running') || !this.outcome || !this.playerState) return;
    if (Date.now() < this.actionLockUntil) return;

    const nowMs = this.roundElapsedMs;
    if (!isBubbleAlive(this.outcome, this.playerState.bubbleId, nowMs)) return;

    this.actionLockUntil = Number.MAX_SAFE_INTEGER;
    const payout = calculateCashout(this.playerState, this.outcome, nowMs);
    this.resolveRound(true, payout);
  }

  private resolveRound(won: boolean, payout: number): void {
    if (this.roundResolving) return;
    this.roundResolving = true;
    console.log(`[Game] Resolve start — won=${won} payout=${payout.toFixed(2)}`);

    this.ui.lockAllInput();

    if (!this.sm.transition('resolve')) {
      console.warn('[Game] resolveRound: transition to resolve failed');
    }

    this.ui.showResolveUI(won, payout);

    const result = won ? `WIN +$${payout.toFixed(2)}` : 'LOSS $0';
    this.roundHistory.unshift(`Seed:${this.roundSeed} ${result}`);
    if (this.roundHistory.length > 5) this.roundHistory.pop();
    this.ui.updateHistory(this.roundHistory.join('\n'));

    this.resolveTimer = won ? POST_CASHOUT_RESOLVE_DELAY_MS : POST_BURST_RESOLVE_DELAY_MS;
  }

  // ---- Main update loop ----

  private update(dt: number): void {
    this.updateSwapTrails(dt * 1000);
    this.effectLayer.tick(dt);
    this.updateScreenShake(dt);

    // --- Intro state: drive typewriter animation ---
    if (this.sm.is('intro')) {
      this.introElapsed += dt * 1000;
      const charsToShow = Math.floor(this.introElapsed / INTRO_CHAR_INTERVAL_MS);
      this.ui.updateIntroText(INTRO_FULL_TEXT.slice(0, charsToShow));
      if (!this.introComplete && charsToShow >= INTRO_FULL_TEXT.length) {
        this.introComplete = true;
        this.ui.showIntroContinueButton(true);
      }
      for (const bv of this.bubbleViews.values()) bv.tickUpdate(0, dt);
      return;
    }

    // --- Lobby state: countdown timer ---
    if (this.sm.is('lobby')) {
      this.lobbyTimer -= dt * 1000;
      this.ui.updateLobbyProgress(Math.max(0, this.lobbyTimer), LOBBY_DURATION_MS);
      for (const bv of this.bubbleViews.values()) bv.tickUpdate(0, dt);
      if (this.lobbyTimer <= 0) {
        this.startRound(this.lobbySelectedBubble ?? 'blue');
      }
      return;
    }

    // Drive active burst animation; defer resolve until it completes.
    if (this.pendingActiveLoss && this.playerState) {
      const bv = this.bubbleViews.get(this.playerState.bubbleId)!;
      bv.tickUpdate(this.roundElapsedMs, dt);
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
      for (const bv of this.bubbleViews.values()) {
        if (bv.isBurst) bv.tickUpdate(this.roundElapsedMs, dt);
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
        this.sm.transition('lobby');
      }
    }
  }

  // ---- Screen shake ----

  private updateScreenShake(dt: number): void {
    if (this._shakeStrength < 0.15) {
      if (this._shakeStrength > 0) {
        this._shakeStrength = 0;
        this.gameWorldLayer.x = 0;
        this.gameWorldLayer.y = 0;
      }
      return;
    }
    this._shakeTime += dt;
    const offset = Math.sin(this._shakeTime * 52) * this._shakeStrength;
    this.gameWorldLayer.x = offset;
    this.gameWorldLayer.y = offset * 0.55;
    // Frame-rate-independent exponential decay
    this._shakeStrength *= Math.pow(SHAKE_DECAY_PER_SEC, dt * 60);
  }

  // ---- Running update ----

  private updateRunning(dt: number): void {
    if (!this.outcome || !this.playerState || this.roundResolving || this.pendingActiveLoss) return;

    this.roundElapsedMs += dt * 1000;

    this.detectBursts();
    if (this.roundResolving || this.pendingActiveLoss || !this.sm.is('running')) return;

    for (const id of BUBBLE_IDS) {
      const bv = this.bubbleViews.get(id)!;
      if (!bv.isBurst) bv.tickUpdate(this.roundElapsedMs, dt);
    }

    if (!this.sm.is('running') || this.roundResolving || !this.playerState) return;

    const activeBubble = this.playerState.bubbleId;
    const gross = getCurrentGrossValue(this.playerState, this.outcome, this.roundElapsedMs);
    const net   = getCurrentNetCashout(this.playerState, this.outcome, this.roundElapsedMs);
    this.ui.updateValue(gross, net);

    if (this.debugMode) {
      const o = this.outcome;
      this.ui.updateDebug(
        `Elapsed: ${this.roundElapsedMs.toFixed(0)}ms  Seed: ${this.roundSeed}\n` +
        `Crash:   B=${o.blue.crashTimeMs.toFixed(0)}  Y=${o.yellow.crashTimeMs.toFixed(0)}  R=${o.red.crashTimeMs.toFixed(0)}\n` +
        `Profile: B=${o.blue.profileId}  Y=${o.yellow.profileId}  R=${o.red.profileId}\n` +
        `Active:  ${activeBubble}  Capital: $${this.playerState.enteredCapital.toFixed(2)}\n` +
        `Gross: $${gross.toFixed(2)}  Net: $${net.toFixed(2)}\n` +
        `Burst:   B=${!isBubbleAlive(o,'blue',this.roundElapsedMs)}  Y=${!isBubbleAlive(o,'yellow',this.roundElapsedMs)}  R=${!isBubbleAlive(o,'red',this.roundElapsedMs)}`
      );
    }

    if (this.roundElapsedMs >= MAX_ROUND_MS) {
      const payout = calculateCashout(this.playerState, this.outcome, this.roundElapsedMs);
      this.resolveRound(true, payout);
    }
  }

  // ---- Burst detection ----

  private detectBursts(): void {
    if (!this.outcome || !this.playerState) return;

    for (const id of BUBBLE_IDS) {
      if (this.roundElapsedMs >= this.outcome[id].crashTimeMs) {
        const bv = this.bubbleViews.get(id)!;
        if (!bv.isBurst) {
          bv.burst();

          // Spawn shockwave at burst position
          const pos      = BUBBLE_POSITIONS[id];
          const isActive = this.playerState.bubbleId === id;
          console.log(`[FX] Shockwave: ${id} isActive=${isActive}`);
          this.effectLayer.spawnShockwave(pos.x, pos.y, BUBBLE_COLORS[id], isActive);

          if (isActive) {
            // Deferred resolve + screen shake for active bubble
            console.log(`[Game] Active bubble burst: ${id}`);
            console.log(`[Game] Burst animation start — deferring resolve for ${FRAGMENT_LIFE_MS}ms`);
            this._shakeStrength   = SHAKE_STRENGTH_ACTIVE;
            this._shakeTime       = 0;
            this.actionLockUntil  = Number.MAX_SAFE_INTEGER;
            this.pendingActiveLoss = true;
            this.activeBurstTimer  = FRAGMENT_LIFE_MS;
            return; // Stop burst scan; resolve deferred until animation finishes.
          }
        }
      }
    }
  }

  // ---- Swap trail (line) ----

  private showSwapTrail(from: BubbleId, to: BubbleId): void {
    const fromPos = BUBBLE_POSITIONS[from];
    const toPos   = BUBBLE_POSITIONS[to];

    const trail = new Graphics();
    trail.moveTo(fromPos.x, fromPos.y);
    trail.lineTo(toPos.x, toPos.y);
    trail.stroke({ color: 0xffffff, alpha: 0.35, width: 1.5 });
    this.swapTrailLayer.addChild(trail);
    this.swapTrailTimers.push({ gfx: trail, life: 350 });
  }

  private updateSwapTrails(dtMs: number): void {
    for (let i = this.swapTrailTimers.length - 1; i >= 0; i--) {
      const t = this.swapTrailTimers[i];
      t.life     -= dtMs;
      t.gfx.alpha = Math.max(0, t.life / 350);
      if (t.life <= 0) {
        this.swapTrailLayer.removeChild(t.gfx);
        t.gfx.destroy();
        this.swapTrailTimers.splice(i, 1);
      }
    }
  }

  // ---- Reset ----

  private performReset(): void {
    console.log('[Game] Reset executed');
    this.pendingActiveLoss = false;
    this.activeBurstTimer  = 0;
    this._shakeStrength    = 0;
    this.gameWorldLayer.x  = 0;
    this.gameWorldLayer.y  = 0;

    for (const bv of this.bubbleViews.values()) bv.resetView();

    for (const t of this.swapTrailTimers) {
      this.swapTrailLayer.removeChild(t.gfx);
      t.gfx.destroy();
    }
    this.swapTrailTimers = [];

    this.effectLayer.reset();  // clears all shockwaves + transfer particles

    this.outcome        = null;
    this.playerState    = null;
    this.roundElapsedMs = 0;
    this.roundResolving = false;
    this.ui.updateDebug('');
    this.ui.updateValue(0, 0);
  }
}
