/**
 * Mulberry32 - fast, seedable 32-bit PRNG.
 * Produces deterministic sequences given the same seed.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  static fromSecureRandom(): Rng {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return new Rng(buf[0]);
  }
}
