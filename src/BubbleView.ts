import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BubbleId, BUBBLE_COLORS, BUBBLE_LABELS, MULTIPLIER_TABLES, TOTAL_TICKS } from './Config';

const BASE_RADIUS = 50;
const MAX_RADIUS = 100;
const WOBBLE_AMPLITUDE = 3;
const WOBBLE_SPEED = 4;

const FRAGMENT_COUNT = 12;
export const FRAGMENT_LIFE_MS = 600;

interface Fragment {
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;
}

export class BubbleView extends Container {
  readonly id: BubbleId;
  private body: Graphics;
  private glow: Graphics;
  private nameLabel: Text;
  private multiplierText: Text;
  private riskLabel: Text;

  private fragments: Fragment[] = [];
  private _isActive = false;
  private _isBurst = false;
  private _currentTick = 0;
  private _wobbleTime = 0;

  constructor(id: BubbleId) {
    super();
    this.id = id;

    this.glow = new Graphics();
    this.addChild(this.glow);

    this.body = new Graphics();
    this.addChild(this.body);

    const color = BUBBLE_COLORS[id];

    const labelStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 14,
      fontWeight: 'bold',
      fill: 0xffffff,
    });
    this.nameLabel = new Text({ text: BUBBLE_LABELS[id], style: labelStyle });
    this.nameLabel.anchor.set(0.5);
    this.nameLabel.y = -12;
    this.addChild(this.nameLabel);

    const multStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 18,
      fontWeight: 'bold',
      fill: 0xffffff,
    });
    this.multiplierText = new Text({ text: '1.00x', style: multStyle });
    this.multiplierText.anchor.set(0.5);
    this.multiplierText.y = 10;
    this.addChild(this.multiplierText);

    const riskStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 10,
      fill: color,
    });
    const riskMap: Record<BubbleId, string> = {
      blue: 'LOW RISK',
      yellow: 'MED RISK',
      red: 'HIGH RISK',
    };
    this.riskLabel = new Text({ text: riskMap[id], style: riskStyle });
    this.riskLabel.anchor.set(0.5);
    this.riskLabel.y = 30;
    this.addChild(this.riskLabel);

    this.drawBody(BASE_RADIUS);
  }

  private drawBody(radius: number): void {
    const color = BUBBLE_COLORS[this.id];
    this.body.clear();
    this.body.circle(0, 0, radius);
    this.body.fill({ color, alpha: 0.7 });
    this.body.stroke({ color: 0xffffff, alpha: 0.3, width: 2 });
  }

  private drawGlow(radius: number): void {
    const color = BUBBLE_COLORS[this.id];
    this.glow.clear();
    if (this._isActive && !this._isBurst) {
      this.glow.circle(0, 0, radius + 10);
      this.glow.fill({ color, alpha: 0.2 });
      this.glow.circle(0, 0, radius + 5);
      this.glow.stroke({ color: 0xffffff, alpha: 0.6, width: 3 });
    }
  }

  setActive(active: boolean): void {
    this._isActive = active;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get isBurst(): boolean {
    return this._isBurst;
  }

  tickUpdate(tick: number, dt: number): void {
    if (this._isBurst) {
      this.updateFragments(dt);
      return;
    }

    this._currentTick = tick;
    this._wobbleTime += dt;

    const table = MULTIPLIER_TABLES[this.id];
    if (!table) {
      console.error(`[BubbleView] Missing multiplier table for id="${this.id}"`);
      return;
    }

    const progress = Math.min(tick / TOTAL_TICKS, 1);
    const radius = BASE_RADIUS + (MAX_RADIUS - BASE_RADIUS) * progress;

    const instability = progress * progress;
    const wobble = Math.sin(this._wobbleTime * WOBBLE_SPEED * (1 + instability * 3))
      * WOBBLE_AMPLITUDE * (1 + instability * 4);

    this.drawBody(radius + wobble);
    this.drawGlow(radius + wobble);

    const idx = Math.max(0, Math.min(Math.floor(tick), table.length - 1));
    const mult = table[idx];
    if (mult === undefined) {
      console.error(
        `[BubbleView] Undefined multiplier: id="${this.id}" tick=${tick} idx=${idx} tableLen=${table.length}`
      );
      this.multiplierText.text = '?.??x';
      return;
    }
    this.multiplierText.text = mult.toFixed(2) + 'x';

    this.alpha = 1;
    this.nameLabel.visible = true;
    this.multiplierText.visible = true;
    this.riskLabel.visible = true;
  }

  burst(): void {
    if (this._isBurst) return;
    this._isBurst = true;

    this.body.clear();
    this.glow.clear();
    this.nameLabel.visible = false;
    this.multiplierText.visible = false;
    this.riskLabel.visible = false;

    this.spawnFragments();
  }

  private spawnFragments(): void {
    const color = BUBBLE_COLORS[this.id];
    const progress = Math.min(this._currentTick / TOTAL_TICKS, 1);
    const radius = BASE_RADIUS + (MAX_RADIUS - BASE_RADIUS) * progress;

    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / FRAGMENT_COUNT + (Math.random() - 0.5) * 0.5;
      const speed = 80 + Math.random() * 120;
      const size = 3 + Math.random() * 6;
      const gfx = new Graphics();
      gfx.circle(0, 0, size);
      gfx.fill({ color, alpha: 0.8 });
      gfx.x = Math.cos(angle) * radius * 0.3;
      gfx.y = Math.sin(angle) * radius * 0.3;
      this.addChild(gfx);
      this.fragments.push({
        gfx,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: FRAGMENT_LIFE_MS,
      });
    }
  }

  private updateFragments(dt: number): void {
    const dtSec = dt;
    for (const f of this.fragments) {
      f.life -= dtSec * 1000;
      f.gfx.x += f.vx * dtSec;
      f.gfx.y += f.vy * dtSec;
      f.gfx.alpha = Math.max(0, f.life / FRAGMENT_LIFE_MS);
      f.vy += 100 * dtSec;
    }
  }

  cleanup(): void {
    for (const f of this.fragments) {
      this.removeChild(f.gfx);
      f.gfx.destroy();
    }
    this.fragments = [];
  }

  resetView(): void {
    this.cleanup();
    this._isBurst = false;
    this._isActive = false;
    this._currentTick = 0;
    this._wobbleTime = 0;

    this.alpha = 1;
    this.nameLabel.visible = true;
    this.multiplierText.visible = true;
    this.riskLabel.visible = true;
    this.multiplierText.text = '1.00x';

    this.drawBody(BASE_RADIUS);
    this.glow.clear();
  }
}
