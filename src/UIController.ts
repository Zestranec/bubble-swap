import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BubbleId, CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_BET } from './Config';

type ButtonCallback = () => void;

interface Button {
  container: Container;
  bg:        Graphics;
  label:     Text;
  callback:  ButtonCallback;
  enabled:   boolean;
}

const PANEL_Y = CANVAS_HEIGHT - 120;  // 640

const BAR_X = 30;
const BAR_Y = 148;
const BAR_W = CANVAS_WIDTH - 60;     // 370
const BAR_H = 10;

export class UIController extends Container {
  private buttons:     Map<string, Button> = new Map();
  private betText!:    Text;
  private valueText!:  Text;
  private statusText!: Text;
  private debugText!:  Text;
  private historyText!:Text;

  private introOverlay!:   Graphics;
  private introText!:      Text;
  private lobbyTimerText!: Text;
  private lobbyHintText!:  Text;
  private runningHintText!:Text;

  private countdownBarBg!:   Graphics;
  private countdownBarFill!: Graphics;

  private _bet = DEFAULT_BET;

  onIntroComplete?: () => void;

  constructor() {
    super();
    this.buildUI();
  }

  get bet(): number { return this._bet; }

  // ---- Build ----

  private buildUI(): void {
    // Permanent header
    const headerStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: 'bold', fill: 0xffffff });
    const title = new Text({ text: 'BUBBLE SWAP', style: headerStyle });
    title.x = CANVAS_WIDTH / 2;
    title.y = 20;
    title.anchor.set(0.5);
    this.addChild(title);

    const subStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x888899 });
    const sub = new Text({ text: '"I should have bought Bitcoin in 2010"', style: subStyle });
    sub.x = CANVAS_WIDTH / 2;
    sub.y = 46;
    sub.anchor.set(0.5);
    this.addChild(sub);

    // Debug overlay (top left)
    const debugStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0x666677 });
    this.debugText = new Text({ text: '', style: debugStyle });
    this.debugText.x = 10;
    this.debugText.y = 65;
    this.addChild(this.debugText);

    // History (top right)
    const historyStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0x555566 });
    this.historyText = new Text({ text: '', style: historyStyle });
    this.historyText.x = CANVAS_WIDTH - 10;
    this.historyText.y = 65;
    this.historyText.anchor.set(1, 0);
    this.addChild(this.historyText);

    // Lobby countdown timer — large, above bar
    const timerStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 38, fontWeight: 'bold', fill: 0xffffff });
    this.lobbyTimerText = new Text({ text: '8', style: timerStyle });
    this.lobbyTimerText.x = CANVAS_WIDTH / 2;
    this.lobbyTimerText.y = 80;
    this.lobbyTimerText.anchor.set(0.5, 0);
    this.addChild(this.lobbyTimerText);

    // Countdown bar background
    this.countdownBarBg = new Graphics();
    this.countdownBarBg.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, 5);
    this.countdownBarBg.fill({ color: 0x222233, alpha: 1 });
    this.addChild(this.countdownBarBg);

    // Countdown bar fill (redrawn each update)
    this.countdownBarFill = new Graphics();
    this.addChild(this.countdownBarFill);

    // Lobby hint below bar
    const hintStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: 0xaaaacc });
    this.lobbyHintText = new Text({ text: '', style: hintStyle });
    this.lobbyHintText.x = CANVAS_WIDTH / 2;
    this.lobbyHintText.y = 172;
    this.lobbyHintText.anchor.set(0.5);
    this.addChild(this.lobbyHintText);

    // Bottom panel background
    const panelBg = new Graphics();
    panelBg.roundRect(0, PANEL_Y - 10, CANVAS_WIDTH, 130, 8);
    panelBg.fill({ color: 0x111122, alpha: 0.9 });
    this.addChild(panelBg);

    // Value readout — above panel during running
    const valueStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold', fill: 0x44ff88 });
    this.valueText = new Text({ text: '', style: valueStyle });
    this.valueText.x = CANVAS_WIDTH / 2;
    this.valueText.y = PANEL_Y - 60;
    this.valueText.anchor.set(0.5);
    this.addChild(this.valueText);

    // Running hint — just above panel
    const runHintStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: 0x8899aa });
    this.runningHintText = new Text({ text: 'Tap bubble to collect  |  Tap other to swap (-3%)', style: runHintStyle });
    this.runningHintText.x = CANVAS_WIDTH / 2;
    this.runningHintText.y = PANEL_Y - 32;
    this.runningHintText.anchor.set(0.5);
    this.addChild(this.runningHintText);

    // Bet controls — centered in panel
    const betRow = PANEL_Y + 18;
    const betLabelStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: 0xcccccc });
    this.betText = new Text({ text: `BET: $${this._bet}`, style: betLabelStyle });
    this.betText.x = CANVAS_WIDTH / 2;
    this.betText.y = betRow + 22;
    this.betText.anchor.set(0.5);
    this.addChild(this.betText);

    this.createButton('bet_down', '−', CANVAS_WIDTH / 2 - 100, betRow, 44, 44, () => this.adjustBet(-5));
    this.createButton('bet_up',   '+', CANVAS_WIDTH / 2 + 56,  betRow, 44, 44, () => this.adjustBet(5));

    // Win/loss status — center stage
    const statusStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 20, fontWeight: 'bold', fill: 0xffffff });
    this.statusText = new Text({ text: '', style: statusStyle });
    this.statusText.x = CANVAS_WIDTH / 2;
    this.statusText.y = 530;
    this.statusText.anchor.set(0.5);
    this.addChild(this.statusText);

    // ---- Intro overlay (added last — renders on top) ----
    this.introOverlay = new Graphics();
    this.introOverlay.rect(0, 60, CANVAS_WIDTH, CANVAS_HEIGHT - 60);
    this.introOverlay.fill({ color: 0x060614, alpha: 0.97 });
    this.addChild(this.introOverlay);

    const introStyle = new TextStyle({
      fontFamily:    'monospace',
      fontSize:      20,
      fill:          0xdde0ff,
      wordWrap:      true,
      wordWrapWidth: 380,
      lineHeight:    36,
    });
    this.introText = new Text({ text: '', style: introStyle });
    this.introText.x = CANVAS_WIDTH / 2;
    this.introText.y = 160;
    this.introText.anchor.set(0.5, 0);
    this.addChild(this.introText);

    this.createButton(
      'intro_continue',
      'Вложиться в пузырь',
      CANVAS_WIDTH / 2 - 125, 380,
      250, 46,
      () => this.onIntroComplete?.(),
      0x1a3a7a
    );

    this.showIntroUI();
  }

  // ---- Button helpers ----

  private createButton(
    name: string, text: string,
    x: number, y: number, w: number, h: number,
    callback: ButtonCallback,
    bgColor = 0x333355
  ): Button {
    const container = new Container();
    container.x = x;
    container.y = y;
    container.eventMode = 'static';
    container.cursor    = 'pointer';

    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 6);
    bg.fill({ color: bgColor, alpha: 0.8 });
    bg.stroke({ color: 0xffffff, alpha: 0.2, width: 1 });
    container.addChild(bg);

    const style = new TextStyle({ fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold', fill: 0xffffff });
    const label = new Text({ text, style });
    label.anchor.set(0.5);
    label.x = w / 2;
    label.y = h / 2;
    container.addChild(label);

    const btn: Button = { container, bg, label, callback, enabled: true };
    container.on('pointerdown', () => {
      if (btn.enabled) btn.callback();
    });

    this.addChild(container);
    this.buttons.set(name, btn);
    return btn;
  }

  private setButtonVisible(name: string, visible: boolean): void {
    const btn = this.buttons.get(name);
    if (btn) btn.container.visible = visible;
  }

  private adjustBet(delta: number): void {
    this._bet = Math.max(5, Math.min(1000, this._bet + delta));
    this.betText.text = `BET: $${this._bet}`;
    if (this.lobbyHintText.visible && this.lobbyHintText.text.startsWith('Tap a bubble')) {
      this.lobbyHintText.text = `Tap a bubble to enter ($${this._bet})`;
    }
  }

  // ---- Intro ----

  showIntroUI(): void {
    this.introOverlay.visible     = true;
    this.introText.visible        = true;
    this.setButtonVisible('intro_continue', false);

    this.setButtonVisible('bet_down', false);
    this.setButtonVisible('bet_up',   false);
    this.betText.visible          = false;
    this.lobbyTimerText.visible   = false;
    this.countdownBarBg.visible   = false;
    this.countdownBarFill.visible = false;
    this.lobbyHintText.visible    = false;
    this.runningHintText.visible  = false;
    this.valueText.text           = '';
    this.statusText.text          = '';
  }

  updateIntroText(text: string): void {
    this.introText.text = text;
  }

  showIntroContinueButton(show: boolean): void {
    this.setButtonVisible('intro_continue', show);
  }

  // ---- Lobby ----

  showLobbyUI(): void {
    this.introOverlay.visible     = false;
    this.introText.visible        = false;
    this.setButtonVisible('intro_continue', false);

    this.setButtonVisible('bet_down', true);
    this.setButtonVisible('bet_up',   true);
    this.betText.visible          = true;
    this.lobbyTimerText.visible   = true;
    this.countdownBarBg.visible   = true;
    this.countdownBarFill.visible = true;
    this.lobbyHintText.visible    = true;
    this.runningHintText.visible  = false;
    this.valueText.text           = '';
    this.statusText.text          = '';

    this.lobbyHintText.text = `Tap a bubble to enter ($${this._bet})`;
  }

  /** Call every frame during lobby with remaining ms and total lobby duration. */
  updateLobbyProgress(remainingMs: number, totalMs: number): void {
    this.lobbyTimerText.text = String(Math.ceil(remainingMs / 1000));

    const ratio = Math.max(0, remainingMs / totalMs);
    const fillW = Math.round(BAR_W * ratio);

    // Drain right-to-left: blue → yellow → red as time runs out
    let color: number;
    if (ratio > 0.5) {
      color = 0x4488ff;
    } else if (ratio > 0.25) {
      color = 0xeab308;
    } else {
      color = 0xef4444;
    }

    this.countdownBarFill.clear();
    if (fillW > 0) {
      this.countdownBarFill.roundRect(BAR_X, BAR_Y, fillW, BAR_H, 5);
      this.countdownBarFill.fill({ color, alpha: 1 });
    }
  }

  updateLobbyHint(selectedBubble: BubbleId | null): void {
    if (selectedBubble) {
      this.lobbyHintText.text = `${selectedBubble.toUpperCase()} selected — starting in...`;
    } else {
      this.lobbyHintText.text = `Tap a bubble to enter ($${this._bet})`;
    }
  }

  // ---- Running ----

  showRunningUI(): void {
    this.introOverlay.visible     = false;
    this.introText.visible        = false;
    this.setButtonVisible('intro_continue', false);

    this.setButtonVisible('bet_down', false);
    this.setButtonVisible('bet_up',   false);
    this.betText.visible          = false;
    this.lobbyTimerText.visible   = false;
    this.countdownBarBg.visible   = false;
    this.countdownBarFill.visible = false;
    this.lobbyHintText.visible    = false;
    this.runningHintText.visible  = true;
    this.statusText.text          = '';
  }

  // ---- Resolve ----

  showResolveUI(won: boolean, payout: number): void {
    this.runningHintText.visible = false;
    if (won) {
      this.statusText.style.fill = 0x44ff88;
      this.statusText.text = `SECURED! +$${payout.toFixed(2)}`;
    } else {
      this.statusText.style.fill = 0xff4444;
      this.statusText.text = 'BURST! $0.00';
    }
  }

  // ---- Shared updates ----

  updateValue(gross: number, net: number): void {
    this.valueText.text = gross > 0
      ? `Value: $${gross.toFixed(2)}  |  Cashout: $${net.toFixed(2)}`
      : '';
  }

  updateDebug(text: string): void {
    this.debugText.text = text;
  }

  updateHistory(text: string): void {
    this.historyText.text = text;
  }

  lockAllInput(): void {
    // No interactive buttons in running state to disable
  }
}
