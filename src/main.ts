import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './Config';
import { Game } from './Game';

async function bootstrap() {
  const app = new Application();
  await app.init({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: 0x0a0a1a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.body.appendChild(app.canvas);

  app.canvas.style.maxWidth = '100%';
  app.canvas.style.maxHeight = '100vh';
  app.canvas.style.margin = 'auto';
  app.canvas.style.display = 'block';

  new Game(app);
}

bootstrap().catch(console.error);
