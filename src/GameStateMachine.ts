export type GameState = 'intro' | 'lobby' | 'betting' | 'running' | 'resolve' | 'reset';

export type StateChangeCallback = (from: GameState, to: GameState) => void;

const VALID_TRANSITIONS: Record<GameState, GameState[]> = {
  intro:   ['lobby'],
  lobby:   ['betting'],
  betting: ['running'],
  running: ['resolve'],
  resolve: ['reset'],
  reset:   ['lobby'],
};

export class GameStateMachine {
  private _state: GameState = 'intro';
  private listeners: StateChangeCallback[] = [];

  get state(): GameState {
    return this._state;
  }

  transition(to: GameState): boolean {
    if (!VALID_TRANSITIONS[this._state].includes(to)) {
      console.warn(`Invalid transition: ${this._state} → ${to}`);
      return false;
    }
    const from = this._state;
    this._state = to;
    for (const cb of this.listeners) cb(from, to);
    return true;
  }

  onStateChange(cb: StateChangeCallback): void {
    this.listeners.push(cb);
  }

  is(state: GameState): boolean {
    return this._state === state;
  }
}
