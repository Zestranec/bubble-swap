export type GameState = 'idle' | 'betting' | 'running' | 'resolve' | 'reset';

export type StateChangeCallback = (from: GameState, to: GameState) => void;

const VALID_TRANSITIONS: Record<GameState, GameState[]> = {
  idle: ['betting'],
  betting: ['running'],
  running: ['resolve'],
  resolve: ['reset'],
  reset: ['idle'],
};

export class GameStateMachine {
  private _state: GameState = 'idle';
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
