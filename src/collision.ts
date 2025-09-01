import * as Game from "./type";
import { State, Pipe } from "./type";
export { handleCollisions };

type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;
const INVINCIBLE_MS = 1000;

const overlapAABB = (a: Rect, b: Rect) =>
  a.x < b.x + b.w &&
  a.x + a.w > b.x &&
  a.y < b.y + b.h &&
  a.y + a.h > b.y;

// Bird -> rect (centered sprite)
const birdRect = (s: State): Rect => ({
    x: s.birb.birbX - Game.Birb.WIDTH / 2,
    y: s.birb.birbY - Game.Birb.HEIGHT / 2,
    w: Game.Birb.WIDTH,
    h: Game.Birb.HEIGHT,
});

// Pipe -> two rects (top + bottom) derived from gap
const pipeRects = (p: Pipe): [Rect, Rect] => {
    const topH = Math.max(0, p.gapY - p.gapH / 2);
    const bottomY = p.gapY + p.gapH / 2;
    const bottomH = Math.max(0, Game.Viewport.CANVAS_HEIGHT - bottomY);

    return [
        { x: p.x, y: 0, w: Game.Constants.PIPE_WIDTH, h: topH },
        { x: p.x, y: bottomY, w: Game.Constants.PIPE_WIDTH, h: bottomH },
    ];
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const randBetween = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// Tune these if you like, or move them into Game.Constants
const BOUNCE_MIN = 6;
const BOUNCE_MAX = 12;

const handleCollisions = (s: State): State => {
    if (s.invincibleUntil !== undefined && s.time < s.invincibleUntil) return s;

  const b = birdRect(s);

  // bounds
  const hitTopBound = b.y <= 0;
  const hitBottomBound = b.y + b.h >= Game.Viewport.CANVAS_HEIGHT;

  // pipes (check top vs bottom)
  let hitTopPipe = false, hitBottomPipe = false;
  for (const p of s.pipes) {
    const [topRect, botRect] = pipeRects(p);
    if (!hitTopPipe && overlapAABB(b, topRect)) hitTopPipe = true;
    if (!hitBottomPipe && overlapAABB(b, botRect)) hitBottomPipe = true;
    if (hitTopPipe || hitBottomPipe) break;
  }

  const anyHit = hitTopBound || hitBottomBound || hitTopPipe || hitBottomPipe;
  if (!anyHit) return s;

  // Decide bounce direction
  const bounceMag = 6 + Math.random() * (12 - 6);
  const bounceVy =
    hitTopBound || hitTopPipe ? +bounceMag :
    hitBottomBound || hitBottomPipe ? -bounceMag :
    -bounceMag;

  const livesLeft = Math.max(0, s.birb.birbLive - 1);
  const gameEnd = livesLeft === 0;

  const clampedY = Math.min(
    Math.max(s.birb.birbY + bounceVy, Game.Birb.HEIGHT / 2),
    Game.Viewport.CANVAS_HEIGHT - Game.Birb.HEIGHT / 2
  );

  return {
    ...s,
    birb: {
      ...s.birb,
      birbLive: livesLeft,
      birbVelocity: gameEnd ? 0 : bounceVy,
      birbY: gameEnd ? s.birb.birbY : clampedY,
    },
    invincibleUntil: gameEnd ? s.time : s.time + INVINCIBLE_MS, // <-- set cooldown
    gameEnd,
  };
};