import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';
import { BubbleId, BUBBLE_COLORS, BUBBLE_IDS, CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_BET } from './Config';

type ButtonCallback = () => void;

interface Button {
  container: Container;
  bg: Graphics;
  label: Text;
  callback: ButtonCallback;
  enabled: boolean;
}

const PANEL_Y = CANVAS_HEIGHT - 130;
const ROW1_Y = PANEL_Y + 8;
const ROW2_Y = PANEL_Y + 42;
const SWAP_ZONE_CENTER = CANVAS_WIDTH / 2;
const SWAP_BTN_W = 100;
const SWAP_BTN_H = 30;
const SWAP_BTN_GAP = 8;

export class UIController extends Container {
  private buttons: Map<string, Button> = new Map();
  private betText!: Text;
  private valueText!: Text;
  private statusText!: Text;
  private debugText!: Text;
  private historyText!: Text;

  private _bet = DEFAULT_BET;
  private _selectedBubble: BubbleId = 'blue';

  onStart?: (bet: number, bubble: BubbleId) => void;
  onSwap?: (target: BubbleId) => void;
  onCashout?: () => void;

  constructor() {
    super();
    this.buildUI();
  }

  get bet(): number { return this._bet; }
  get selectedBubble(): BubbleId { return this._selectedBubble; }

  private buildUI(): void {
    const panelBg = new Graphics();
    panelBg.roundRect(0, PANEL_Y - 10, CANVAS_WIDTH, 140, 8);
    panelBg.fill({ color: 0x111122, alpha: 0.9 });
    this.addChild(panelBg);

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

    // --- Left zone: bet controls ---
    const betStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: 0xcccccc });
    this.betText = new Text({ text: `BET: $${this._bet}`, style: betStyle });
    this.betText.x = 20;
    this.betText.y = ROW1_Y + 4;
    this.addChild(this.betText);

    this.createButton('bet_down', '−', 120, ROW1_Y, 30, 24, () => this.adjustBet(-5));
    this.createButton('bet_up', '+', 160, ROW1_Y, 30, 24, () => this.adjustBet(5));

    // Bubble selectors (idle only) — left-center area
    for (let i = 0; i < BUBBLE_IDS.length; i++) {
      const id = BUBBLE_IDS[i];
      this.createButton(
        `select_${id}`,
        id.toUpperCase(),
        220 + i * 90,
        ROW1_Y,
        80,
        24,
        () => this.selectBubble(id),
        BUBBLE_COLORS[id]
      );
    }

    // Start button (idle only) — centered
    this.createButton('start', 'START', CANVAS_WIDTH / 2 - 60, ROW2_Y, 120, 36, () => {
      this.onStart?.(this._bet, this._selectedBubble);
    }, 0x22aa44);

    // --- Right zone: cashout button (running only) ---
    this.createButton('cashout', 'CASH OUT', CANVAS_WIDTH - 170, ROW2_Y, 150, 36, () => {
      this.onCashout?.();
    }, 0x22aa44);

    // --- Center zone: swap buttons (running only, repositioned dynamically) ---
    for (const id of BUBBLE_IDS) {
      this.createButton(
        `swap_${id}`,
        `→ ${id.toUpperCase()}`,
        0, ROW2_Y + 3,
        SWAP_BTN_W, SWAP_BTN_H,
        () => this.onSwap?.(id),
        BUBBLE_COLORS[id]
      );
    }

    // Value readout — between rows
    const valueStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold', fill: 0x44ff88 });
    this.valueText = new Text({ text: '', style: valueStyle });
    this.valueText.x = CANVAS_WIDTH / 2;
    this.valueText.y = ROW1_Y + 4;
    this.valueText.anchor.set(0.5);
    this.addChild(this.valueText);

    // Status text (win/loss) — above panel
    const statusStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 20, fontWeight: 'bold', fill: 0xffffff });
    this.statusText = new Text({ text: '', style: statusStyle });
    this.statusText.x = CANVAS_WIDTH / 2;
    this.statusText.y = CANVAS_HEIGHT / 2 + 130;
    this.statusText.anchor.set(0.5);
    this.addChild(this.statusText);

    // Debug overlay — top left
    const debugStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0x666677 });
    this.debugText = new Text({ text: '', style: debugStyle });
    this.debugText.x = 10;
    this.debugText.y = 65;
    this.addChild(this.debugText);

    // History — top right
    const historyStyle = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0x555566 });
    this.historyText = new Text({ text: '', style: historyStyle });
    this.historyText.x = CANVAS_WIDTH - 10;
    this.historyText.y = 65;
    this.historyText.anchor.set(1, 0);
    this.addChild(this.historyText);

    this.showIdleUI();
  }

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
    container.cursor = 'pointer';

    const bg = new Graphics();
    bg.roundRect(0, 0, w, h, 6);
    bg.fill({ color: bgColor, alpha: 0.8 });
    bg.stroke({ color: 0xffffff, alpha: 0.2, width: 1 });
    container.addChild(bg);

    const style = new TextStyle({ fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', fill: 0xffffff });
    const label = new Text({ text, style });
    label.anchor.set(0.5);
    label.x = w / 2;
    label.y = h / 2;
    container.addChild(label);

    const btn: Button = { container, bg, label, callback, enabled: true };
    container.on('pointerdown', (_e: FederatedPointerEvent) => {
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

  private setButtonEnabled(name: string, enabled: boolean): void {
    const btn = this.buttons.get(name);
    if (btn) {
      btn.enabled = enabled;
      btn.container.alpha = enabled ? 1 : 0.4;
    }
  }

  private adjustBet(delta: number): void {
    this._bet = Math.max(5, Math.min(1000, this._bet + delta));
    this.betText.text = `BET: $${this._bet}`;
  }

  private selectBubble(id: BubbleId): void {
    this._selectedBubble = id;
    for (const bid of BUBBLE_IDS) {
      const btn = this.buttons.get(`select_${bid}`);
      if (btn) {
        btn.bg.clear();
        btn.bg.roundRect(0, 0, 80, 24, 6);
        const isSelected = bid === id;
        btn.bg.fill({ color: BUBBLE_COLORS[bid], alpha: isSelected ? 0.9 : 0.3 });
        btn.bg.stroke({ color: 0xffffff, alpha: isSelected ? 0.8 : 0.1, width: isSelected ? 2 : 1 });
      }
    }
  }

  showIdleUI(): void {
    this.setButtonVisible('start', true);
    this.setButtonVisible('cashout', false);
    this.setButtonVisible('bet_down', true);
    this.setButtonVisible('bet_up', true);
    this.betText.visible = true;
    this.valueText.text = '';
    for (const id of BUBBLE_IDS) {
      this.setButtonVisible(`select_${id}`, true);
      this.setButtonVisible(`swap_${id}`, false);
    }
    this.setButtonEnabled('start', true);
    this.statusText.text = '';
    this.selectBubble(this._selectedBubble);
  }

  showRunningUI(activeBubble: BubbleId): void {
    this.setButtonVisible('start', false);
    this.setButtonVisible('cashout', true);
    this.setButtonEnabled('cashout', true);
    this.setButtonVisible('bet_down', false);
    this.setButtonVisible('bet_up', false);
    this.betText.visible = false;
    for (const id of BUBBLE_IDS) {
      this.setButtonVisible(`select_${id}`, false);
    }
    this.updateSwapButtons(activeBubble, BUBBLE_IDS);
    this.statusText.text = '';
  }

  updateSwapButtons(activeBubble: BubbleId, aliveBubbles: BubbleId[]): void {
    const visibleIds: BubbleId[] = [];
    for (const id of BUBBLE_IDS) {
      const show = aliveBubbles.includes(id) && id !== activeBubble;
      this.setButtonVisible(`swap_${id}`, show);
      this.setButtonEnabled(`swap_${id}`, show);
      if (show) visibleIds.push(id);
    }
    this.repositionSwapButtons(visibleIds);
  }

  private repositionSwapButtons(visibleIds: BubbleId[]): void {
    const count = visibleIds.length;
    if (count === 0) return;
    const totalWidth = count * SWAP_BTN_W + (count - 1) * SWAP_BTN_GAP;
    const startX = SWAP_ZONE_CENTER - totalWidth / 2;
    for (let i = 0; i < count; i++) {
      const btn = this.buttons.get(`swap_${visibleIds[i]}`);
      if (btn) {
        btn.container.x = startX + i * (SWAP_BTN_W + SWAP_BTN_GAP);
      }
    }
  }

  showResolveUI(won: boolean, payout: number): void {
    this.setButtonVisible('cashout', false);
    for (const id of BUBBLE_IDS) {
      this.setButtonVisible(`swap_${id}`, false);
    }
    if (won) {
      this.statusText.style.fill = 0x44ff88;
      this.statusText.text = `SECURED! +$${payout.toFixed(2)}`;
    } else {
      this.statusText.style.fill = 0xff4444;
      this.statusText.text = 'BURST! $0.00';
    }
  }

  updateValue(gross: number, net: number): void {
    this.valueText.text = `Value: $${gross.toFixed(2)}  |  Cashout: $${net.toFixed(2)}`;
  }

  updateDebug(text: string): void {
    this.debugText.text = text;
  }

  updateHistory(text: string): void {
    this.historyText.text = text;
  }

  lockAllInput(): void {
    this.setButtonEnabled('cashout', false);
    for (const id of BUBBLE_IDS) {
      this.setButtonEnabled(`swap_${id}`, false);
    }
  }

  unlockRunningInput(activeBubble: BubbleId, aliveBubbles: BubbleId[]): void {
    this.setButtonEnabled('cashout', true);
    this.updateSwapButtons(activeBubble, aliveBubbles);
  }
}
