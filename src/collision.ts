import * as Game from "./type";
import { State, Pipe, Rect } from "./type";
export { handleCollisions };

/**
 * This is a helper function to help with collision, It returns true if 2 rects overlap on both x and y axes
 * @param a rect a
 * @param b rect b
 * @returns boolean
 */
const overlapAABB = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * This function is to box the Birb into a rect so that it's easier to handle the collisions
 * Bird -> rect (centered sprite)
 * @param s 
 * @returns 
 */
const birdRect = (s: State): Rect => ({
    x: s.birb.birbX - Game.Birb.WIDTH / 2,
    y: s.birb.birbY - Game.Birb.HEIGHT / 2,
    w: Game.Birb.WIDTH,
    h: Game.Birb.HEIGHT,
});


/**
 * This function turns a pipe with a vertical gap into 2 rects
 * Pipe -> two rects (top + bottom) derived from gap
 * Top pipes (top rect) is from the top of the screen down to the top edge of the Gap
 * Bottom pipes (bottom rect) is from the bottom edge of the Gap dowm to the bottom of the screen
 * @param p 
 * @returns the properties of the top and bottoms rects/pipes
 */
const pipeRects = (p: Pipe): [Rect, Rect] => {
    const topH = Math.max(0, p.gapY - p.gapH / 2);
    const bottomY = p.gapY + p.gapH / 2;
    const bottomH = Math.max(0, Game.Viewport.CANVAS_HEIGHT - bottomY);

    return [
        { x: p.x, y: 0, w: Game.Constants.PIPE_WIDTH, h: topH },
        { x: p.x, y: bottomY, w: Game.Constants.PIPE_WIDTH, h: bottomH },
    ];
};

/**
 * This function handles the collisions of the Birb with the Pipes + Top/Bottom edges of the screen
 * @param s 
 * @returns 
 */
const handleCollisions = (s: State): State => {

    //Check the Birb's invincibility
    if (s.invincibleUntil !== undefined && s.time < s.invincibleUntil) return s;

    // Box the Birb up into a rect
    const b = birdRect(s);

    // Compute lives and dead
    const lives = Math.max(0, s.birb.birbLive - 1);
    const dead = lives === 0;

    /**
     * From this point the function starts to check for the collisions
     */
    
    const hitTopBound = b.y <= 0; // bird's top edge at or above 0
    const hitBottomBound = b.y + b.h >= Game.Viewport.CANVAS_HEIGHT; // bird's bottom edge at or below canvas height

    // This part it checks for each pipe, it builds two rects and checks overlap against the bird using overlapAABB
    const hitTopPipe = s.pipes.some(p => overlapAABB(b, pipeRects(p)[0]));
    const hitBottomPipe = s.pipes.some(p => overlapAABB(b, pipeRects(p)[1]));

    // If none of those are true then return the original state (continue the game)
    const anyHit = hitTopBound || hitBottomBound || hitTopPipe || hitBottomPipe;
    if (!anyHit) return s;

    /**
     * This part handles if the Birb hit the top edge/top pipe it will bounce down, and vice versa
     */
    // Decide the bounce direction
    const bounceMag =
        Game.Constants.BOUNCE_MIN +
        ((s.time % 1000) / 1000) * (Game.Constants.BOUNCE_MAX - Game.Constants.BOUNCE_MIN);
    const bounceVy =
        (hitTopBound || hitTopPipe) ? +bounceMag : -bounceMag;

    // If all the lives are gone, set gameEnd to true and stop the game, and set birbLive and birbVelocity to 0
    if (lives === 0) {
        return {
            ...s,
            birb: { ...s.birb, birbLive: 0, birbVelocity: 0 },
            gameEnd: true,
            won: false,
            winAt: undefined,
        };
    }

    // If the Birb isn't out of life yet then apply the bounce logic to it
    const minY = Game.Birb.HEIGHT / 2;
    const maxY = Game.Viewport.CANVAS_HEIGHT - Game.Birb.HEIGHT / 2;
    const newY = Math.max(minY, Math.min(maxY, s.birb.birbY + bounceVy));

    // Return a new State
    return {
        ...s,
        birb: {
            ...s.birb,
            birbLive: lives, // Since the Birb hit something and bounced, deduct a life
            birbVelocity: bounceVy,
            birbY: newY,
        },
        invincibleUntil: s.time + Game.Constants.INVINCIBLE_MS,
        // don’t flip gameEnd here unless it was already set elsewhere
        gameEnd: s.gameEnd || dead,
        won: dead ? false : s.won,
        winAt: dead ? undefined : s.winAt,
    };
};
