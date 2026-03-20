/**
 * EffectLayer — visual-only juice effects.
 * Contains: shockwaves (burst), swap transfer particles.
 * Never touches math, outcome, or payout.
 */
import { Container, Graphics } from 'pixi.js';

const SHOCKWAVE_DURATION_ACTIVE  = 420; // ms
const SHOCKWAVE_DURATION_PASSIVE = 300; // ms

const TRANSFER_DURATION          = 320; // ms
const TRANSFER_PARTICLE_COUNT    = 7;
const TRANSFER_ARRIVAL_FRAC      = 0.62; // fire onArrival at 62% through

// ---- Internal types ----

interface Shockwave {
  gfx:         Graphics;
  life:        number;
  maxLife:     number;
  startRadius: number;
  endRadius:   number;
  color:       number;
  strokeWidth: number;
}

interface TransferParticle {
  gfx:    Graphics;
  life:   number;       // ms remaining
  maxLife:number;
  startX: number;
  startY: number;
  endX:   number;
  endY:   number;
  perpX:  number;       // unit perpendicular to path
  perpY:  number;
  arcAmt: number;       // deterministic arc deviation (px)
}

interface TransferEffect {
  particles:    TransferParticle[];
  onArrival:    () => void;
  arrivalFired: boolean;
  elapsed:      number; // ms since spawn
}

export class EffectLayer extends Container {
  private shockwaves: Shockwave[]     = [];
  private transfers:  TransferEffect[] = [];

  // ---- Shockwave ----

  /**
   * Spawn a burst shockwave at (x, y).
   * isActive = true → stronger, double-ring effect.
   */
  spawnShockwave(x: number, y: number, color: number, isActive: boolean): void {
    const ringCount = isActive ? 2 : 1;

    for (let r = 0; r < ringCount; r++) {
      const maxLife   = isActive ? SHOCKWAVE_DURATION_ACTIVE : SHOCKWAVE_DURATION_PASSIVE;
      const startR    = 58 + r * 8;
      const endR      = isActive ? (155 + r * 25) : 115;
      const strokeW   = isActive ? (3.5 - r * 1.0) : 1.8;

      const gfx = new Graphics();
      gfx.x = x;
      gfx.y = y;
      this.addChild(gfx);

      this.shockwaves.push({ gfx, life: maxLife, maxLife, startRadius: startR, endRadius: endR, color, strokeWidth: strokeW });
    }
  }

  // ---- Swap transfer particles ----

  /**
   * Spawn deterministic arc-particles traveling from source to target.
   * onArrival fires at ~62% through the animation (particles approaching target).
   */
  spawnSwapTransfer(
    fromX: number, fromY: number,
    toX:   number, toY:   number,
    color: number,
    onArrival: () => void,
  ): void {
    const dx  = toX - fromX;
    const dy  = toY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len;
    const perpY =  dx / len;

    const effect: TransferEffect = { particles: [], onArrival, arrivalFired: false, elapsed: 0 };

    for (let i = 0; i < TRANSFER_PARTICLE_COUNT; i++) {
      const gfx = new Graphics();
      gfx.x = fromX;
      gfx.y = fromY;
      this.addChild(gfx);

      // Deterministic arc: alternating sides, increasing magnitude by particle index
      const sign   = (i % 2 === 0) ? 1 : -1;
      const arcAmt = sign * (8 + Math.floor(i / 2) * 14); // 8, -8, 22, -22, 36, -36, 50

      effect.particles.push({
        gfx,
        life:    TRANSFER_DURATION,
        maxLife: TRANSFER_DURATION,
        startX: fromX, startY: fromY,
        endX:   toX,   endY:   toY,
        perpX, perpY, arcAmt,
      });
    }

    this.transfers.push(effect);
  }

  // ---- Tick ----

  tick(dtSec: number): void {
    const dtMs = dtSec * 1000;
    this.tickShockwaves(dtMs);
    this.tickTransfers(dtMs);
  }

  private tickShockwaves(dtMs: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dtMs;
      if (sw.life <= 0) {
        this.removeChild(sw.gfx);
        sw.gfx.destroy();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const t      = 1 - sw.life / sw.maxLife;                              // 0→1 expanding
      const radius = sw.startRadius + (sw.endRadius - sw.startRadius) * t;
      const alpha  = (sw.life / sw.maxLife) * 0.9;                          // fade out

      sw.gfx.clear();
      sw.gfx.circle(0, 0, radius);
      sw.gfx.stroke({ color: sw.color, alpha, width: sw.strokeWidth });
    }
  }

  private tickTransfers(dtMs: number): void {
    for (let i = this.transfers.length - 1; i >= 0; i--) {
      const tf = this.transfers[i];
      tf.elapsed += dtMs;

      // Fire arrival callback once particles are ~62% of the way there
      if (!tf.arrivalFired && tf.elapsed >= TRANSFER_DURATION * TRANSFER_ARRIVAL_FRAC) {
        tf.arrivalFired = true;
        tf.onArrival();
      }

      let anyAlive = false;
      for (const p of tf.particles) {
        if (p.life <= 0) continue;
        p.life -= dtMs;
        anyAlive = true;

        const raw  = Math.max(0, 1 - p.life / p.maxLife);  // 0→1
        const ease = raw * raw * (3 - 2 * raw);             // smoothstep
        const arc  = Math.sin(Math.PI * raw);                // peak at midpoint

        const cx = p.startX + (p.endX - p.startX) * ease + p.perpX * p.arcAmt * arc;
        const cy = p.startY + (p.endY - p.startY) * ease + p.perpY * p.arcAmt * arc;

        // Fade last 60ms, shrink slightly toward end
        const alpha  = p.life < 60 ? p.life / 60 : 1.0;
        const radius = 4.5 * (1 - raw * 0.35);

        p.gfx.clear();
        p.gfx.x = cx;
        p.gfx.y = cy;
        // Inner bright core
        p.gfx.circle(0, 0, radius);
        p.gfx.fill({ color: 0xffffff, alpha: alpha * 0.95 });
        // Outer soft halo
        p.gfx.circle(0, 0, radius * 1.8);
        p.gfx.fill({ color: 0xaaddff, alpha: alpha * 0.35 });
      }

      if (!anyAlive) {
        for (const p of tf.particles) {
          this.removeChild(p.gfx);
          p.gfx.destroy();
        }
        this.transfers.splice(i, 1);
      }
    }
  }

  // ---- Reset / cleanup ----

  reset(): void {
    for (const sw of this.shockwaves) {
      this.removeChild(sw.gfx);
      sw.gfx.destroy();
    }
    this.shockwaves = [];

    for (const tf of this.transfers) {
      for (const p of tf.particles) {
        this.removeChild(p.gfx);
        p.gfx.destroy();
      }
    }
    this.transfers = [];
  }
}
