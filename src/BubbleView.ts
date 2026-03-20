import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BubbleId, BUBBLE_COLORS, BUBBLE_LABELS, MAX_ROUND_MS } from './Config';
import { GrowthProfileId, evaluateProfile } from './GrowthProfiles';

const BASE_RADIUS      = 55;
const WOBBLE_AMPLITUDE = 3;
const WOBBLE_SPEED     = 4;
const WARN_WINDOW_MS   = 500;
const ARRIVAL_FLASH_MS = 280;

const FRAGMENT_COUNT = 12;
export const FRAGMENT_LIFE_MS = 600;

interface Fragment {
  gfx:  Graphics;
  vx:   number;
  vy:   number;
  life: number;
}

export class BubbleView extends Container {
  readonly id: BubbleId;
  private body: Graphics;
  private glow: Graphics;
  private nameLabel:     Text;
  private multiplierText:Text;
  private riskLabel:     Text;
  private collectLabel:  Text;     // shown on active bubble during running

  private fragments: Fragment[] = [];
  private _isActive         = false;
  private _isBurst          = false;
  private _lobbyHighlight   = false;
  private _collectVisible   = false;
  private _currentElapsedMs = 0;
  private _wobbleTime       = 0;
  private _breathPhase      = 0;
  private _profileId: GrowthProfileId | null = null;
  private _displayScale     = 1.0;

  // Pre-crash anticipation
  private _crashTimeMs  = Infinity;
  private _warnProgress = 0;

  // Swap arrival flash
  private _arrivalFlashMs = 0;

  /** Fired when the bubble is tapped/clicked (not burst). */
  onTap?: (id: BubbleId) => void;

  constructor(id: BubbleId) {
    super();
    this.id = id;
    this.eventMode = 'static';
    this.cursor    = 'pointer';
    this.on('pointerdown', () => {
      if (!this._isBurst) this.onTap?.(this.id);
    });

    this.glow = new Graphics();
    this.addChild(this.glow);

    this.body = new Graphics();
    this.addChild(this.body);

    const color = BUBBLE_COLORS[id];

    const labelStyle = new TextStyle({
      fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', fill: 0xffffff,
    });
    this.nameLabel = new Text({ text: BUBBLE_LABELS[id], style: labelStyle });
    this.nameLabel.anchor.set(0.5);
    this.nameLabel.y = -14;
    this.addChild(this.nameLabel);

    const multStyle = new TextStyle({
      fontFamily: 'monospace', fontSize: 17, fontWeight: 'bold', fill: 0xffffff,
    });
    this.multiplierText = new Text({ text: '1.00x', style: multStyle });
    this.multiplierText.anchor.set(0.5);
    this.multiplierText.y = 6;
    this.addChild(this.multiplierText);

    const riskStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 9, fill: color });
    const riskMap: Record<BubbleId, string> = {
      blue:   'LOW RISK',
      yellow: 'MED RISK',
      red:    'HIGH RISK',
    };
    this.riskLabel = new Text({ text: riskMap[id], style: riskStyle });
    this.riskLabel.anchor.set(0.5);
    this.riskLabel.y = 26;
    this.addChild(this.riskLabel);

    // Collect affordance — shown only on active bubble during running
    const collectStyle = new TextStyle({
      fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold', fill: 0x44ff88,
    });
    this.collectLabel = new Text({ text: 'COLLECT', style: collectStyle });
    this.collectLabel.anchor.set(0.5);
    this.collectLabel.y = 26;   // same y as riskLabel — replaces it when active
    this.collectLabel.visible = false;
    this.addChild(this.collectLabel);

    this.drawBody(BASE_RADIUS);
  }

  // ---- Public setters ----

  setActive(active: boolean): void { this._isActive = active; }
  get isActive(): boolean           { return this._isActive; }
  get isBurst():  boolean           { return this._isBurst; }

  setLobbyHighlight(on: boolean): void { this._lobbyHighlight = on; }

  /** Show/hide the COLLECT affordance on this bubble. */
  setCollectVisible(visible: boolean): void { this._collectVisible = visible; }

  /** Set crash time to enable pre-crash warning glow. */
  setCrashTime(ms: number): void { this._crashTimeMs = ms; }

  /** Briefly flash on swap arrival. */
  triggerArrivalFlash(): void { this._arrivalFlashMs = ARRIVAL_FLASH_MS; }

  /** Call at round start with the assigned growth profile. */
  setProfile(profileId: GrowthProfileId): void { this._profileId = profileId; }

  // ---- Update ----

  tickUpdate(elapsedMs: number, dt: number): void {
    if (this._isBurst) {
      this.updateFragments(dt);
      return;
    }

    this._currentElapsedMs = elapsedMs;
    this._wobbleTime  += dt;
    this._breathPhase += dt * 1.8;

    if (this._arrivalFlashMs > 0) {
      this._arrivalFlashMs = Math.max(0, this._arrivalFlashMs - dt * 1000);
    }

    // Pre-crash warning progress
    if (this._crashTimeMs < Infinity) {
      const warnStart = this._crashTimeMs - WARN_WINDOW_MS;
      this._warnProgress = Math.max(0, Math.min(1, (elapsedMs - warnStart) / WARN_WINDOW_MS));
    } else {
      this._warnProgress = 0;
    }

    const progress    = Math.min(elapsedMs / MAX_ROUND_MS, 1);
    const instability = progress * progress;

    const speedMult = 1 + instability * 3 + this._warnProgress * 2.5;
    const ampMult   = 1 + instability * 4 + this._warnProgress * 4;
    const wobble = Math.sin(this._wobbleTime * WOBBLE_SPEED * speedMult)
      * WOBBLE_AMPLITUDE * ampMult;

    this.drawBody(BASE_RADIUS + wobble);
    this.drawGlow(BASE_RADIUS + wobble);

    const mult = this._profileId ? evaluateProfile(this._profileId, elapsedMs) : 1.0;
    this.multiplierText.text = mult.toFixed(2) + 'x';

    // Active bubble gets a 1.07x scale boost; inactive bubbles stay at base scale
    const baseTargetScale = 1 + (mult - 1) * 0.16;
    const targetScale     = this._isActive ? baseTargetScale * 1.05 : baseTargetScale;
    this._displayScale += (targetScale - this._displayScale) * Math.min(dt * 8, 1);
    // Add slow breathing oscillation for active bubble only
    const breathOffset = this._isActive ? 0.012 * Math.sin(this._breathPhase) : 0;
    this.scale.set(this._displayScale + breathOffset);

    // Inactive non-burst bubbles are slightly dimmed so the active one dominates
    this.alpha = (this._isActive || this._lobbyHighlight) ? 1 : 0.72;
    this.nameLabel.visible      = true;
    this.multiplierText.visible = true;
    // COLLECT replaces risk label when active in running
    this.riskLabel.visible    = !this._collectVisible;
    this.collectLabel.visible =  this._collectVisible;
  }

  // ---- Burst ----

  burst(): void {
    if (this._isBurst) return;
    this._isBurst = true;

    this.body.clear();
    this.glow.clear();
    this.nameLabel.visible      = false;
    this.multiplierText.visible = false;
    this.riskLabel.visible      = false;
    this.collectLabel.visible   = false;

    this.spawnFragments();
  }

  // ---- Reset ----

  cleanup(): void {
    for (const f of this.fragments) {
      this.removeChild(f.gfx);
      f.gfx.destroy();
    }
    this.fragments = [];
  }

  resetView(): void {
    this.cleanup();
    this._isBurst          = false;
    this._isActive         = false;
    this._lobbyHighlight   = false;
    this._collectVisible   = false;
    this._currentElapsedMs = 0;
    this._wobbleTime       = 0;
    this._breathPhase      = 0;
    this._profileId        = null;
    this._displayScale     = 1.0;
    this._crashTimeMs      = Infinity;
    this._warnProgress     = 0;
    this._arrivalFlashMs   = 0;

    this.scale.set(1.0);
    this.alpha = 1;
    this.nameLabel.visible      = true;
    this.multiplierText.visible = true;
    this.riskLabel.visible      = true;
    this.collectLabel.visible   = false;
    this.multiplierText.text    = '1.00x';

    this.drawBody(BASE_RADIUS);
    this.glow.clear();
  }

  // ---- Private draw ----

  private drawBody(radius: number): void {
    const color = BUBBLE_COLORS[this.id];
    this.body.clear();
    this.body.circle(0, 0, radius);
    this.body.fill({ color, alpha: 0.7 });
    this.body.stroke({ color: 0xffffff, alpha: 0.3, width: 2 });
  }

  private drawGlow(radius: number): void {
    this.glow.clear();
    if (this._isBurst) return;

    // ---- 1. Pre-crash warning rings ----
    if (this._warnProgress > 0) {
      const p     = this._warnProgress;
      const pulse = (Math.sin(this._wobbleTime * (9 + p * 22)) * 0.5 + 0.5);

      this.glow.circle(0, 0, radius + 13 + pulse * 9 * p);
      this.glow.stroke({ color: 0xff6200, alpha: p * (0.3 + pulse * 0.5), width: 1.5 + p * 2.5 });

      if (p > 0.35) {
        const tintA = (p - 0.35) / 0.65 * 0.13 * (0.4 + pulse * 0.6);
        this.glow.circle(0, 0, radius);
        this.glow.fill({ color: 0xff2200, alpha: tintA });
      }

      if (this._isActive && p > 0.5) {
        this.glow.circle(0, 0, radius + 22 + pulse * 14);
        this.glow.stroke({ color: 0xffaa00, alpha: (p - 0.5) * 0.9 * pulse, width: 2 });
      }
    }

    // ---- 2. Active glow / lobby highlight ----
    const color = BUBBLE_COLORS[this.id];
    if (this._isActive) {
      const breathPulse = Math.sin(this._breathPhase) * 0.5 + 0.5;  // 0..1

      // Layer 1: large soft outer halo
      this.glow.circle(0, 0, radius + 32 + breathPulse * 7);
      this.glow.fill({ color, alpha: 0.10 + breathPulse * 0.07 });

      // Layer 2: medium colored fill
      this.glow.circle(0, 0, radius + 18);
      this.glow.fill({ color, alpha: 0.22 + breathPulse * 0.10 });

      // Layer 3: outer colored ring — pulsing
      this.glow.circle(0, 0, radius + 20 + breathPulse * 5);
      this.glow.stroke({ color, alpha: 0.55 + breathPulse * 0.30, width: 2.5 });

      // Layer 4: bright inner white ring — pulsing alpha
      this.glow.circle(0, 0, radius + 5);
      this.glow.stroke({ color: 0xffffff, alpha: 0.65 + breathPulse * 0.30, width: 4 });
    } else if (this._lobbyHighlight) {
      this.glow.circle(0, 0, radius + 12);
      this.glow.stroke({ color: 0xffffff, alpha: 0.85, width: 3 });
    }

    // ---- 3. Swap arrival flash ----
    if (this._arrivalFlashMs > 0) {
      const fp = this._arrivalFlashMs / ARRIVAL_FLASH_MS;
      this.glow.circle(0, 0, radius + 20);
      this.glow.stroke({ color: 0xffffff, alpha: fp * 0.85, width: 3 + fp * 4 });
      this.glow.circle(0, 0, radius + 6);
      this.glow.fill({ color: 0xffffff, alpha: fp * 0.22 });
    }
  }

  private spawnFragments(): void {
    const color  = BUBBLE_COLORS[this.id];
    const radius = BASE_RADIUS * this._displayScale;

    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / FRAGMENT_COUNT + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 120;
      const size  = 3 + Math.random() * 6;

      const gfx = new Graphics();
      gfx.circle(0, 0, size);
      gfx.fill({ color, alpha: 0.8 });
      gfx.x = Math.cos(angle) * radius * 0.3;
      gfx.y = Math.sin(angle) * radius * 0.3;
      this.addChild(gfx);

      this.fragments.push({ gfx, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: FRAGMENT_LIFE_MS });
    }
  }

  private updateFragments(dt: number): void {
    for (const f of this.fragments) {
      f.life     -= dt * 1000;
      f.gfx.x    += f.vx * dt;
      f.gfx.y    += f.vy * dt;
      f.gfx.alpha = Math.max(0, f.life / FRAGMENT_LIFE_MS);
      f.vy += 100 * dt;
    }
  }
}
