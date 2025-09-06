import * as Game from "./type";
import { Key, Event, State, Action, Body } from "./type";
import { handleCollisions } from "./collision";

export {
    Jump,
    reduceState,
    Gravity,
    CreatePipe,
    TickPipes,
    Tick,
    createBirb,
    initialState,
};

/**
 * This class Purely bumps the time forward by dt milliseconds
 */
class Tick implements Action {
    constructor(private readonly dt = Game.Constants.TICK_RATE_MS) {}
    apply(s: State): State {
        return { ...s, time: s.time + this.dt };
    }
}

/**
 * This class handle the jumping action of the Birb
 * It sets an upward velocity
 * But this class doesn't movethe Birb, just setting the velocity for the Birb to move up
 * Gravity/Tick move it over time
 */
class Jump implements Action {
    constructor(public readonly velocity: number) {}
    apply(s: State): State {
        return {
            ...s,
            birb: { ...s.birb, birbVelocity: -this.velocity },
        };
    }
}

/**
 * This pure function creates the Birb (constructor for Birb), and initialize the Birb with the
 * values being passed in.
 *
 * @param id The birb's id
 * @param x The birb's starting X position
 * @param y The birb's starting Y position
 * @param createdAt The birb's create time
 * @param lives The birb's number of lives
 * @returns
 */
function createBirb(
    id: string,
    x: number,
    y: number,
    createdAt: number,
    lives = Game.Birb.BIRB_LIVES,
): Body {
    return {
        id,
        birbX: x,
        birbY: y,
        birbVelocity: 0,
        birbLive: lives,
        createTime: createdAt,
    };
}

/**
 * This is a pure initial State factory
 * @param t0 We pass t0 (performance.now()) from the call site to keep this pure
 * @param canvasW
 * @param canvasH
 * @returns
 */
const initialState = (t0: number, canvasW: number, canvasH: number): State => ({
    gameEnd: false,
    time: t0,
    pipes: [],
    exit: [],
    objCount: 0,
    score: 0,
    birb: createBirb("birb", canvasW * 0.3, canvasH / 2, t0),
});

/**
 * This class adds Gravity to the birb velocity (which is just changing the velocity)
 * But have a limit to it (fall_rate), if not then the Birb will keep fallign faster and faster
 * The upward jumping velocity of the Birb gets counter by the Gravity across every ticks
 */
class Gravity implements Action {
    apply(s: State): State {
        // If the birbVelocity gets bigger than the MAX_FALL_RATE (since the gravity kept being added to the velocity)
        // Then MAX_FALL_RATE will be used
        const fall_rate = Math.min(
            s.birb.birbVelocity + Game.Constants.GRAVITY,
            Game.Constants.MAX_FALL_RATE,
        );

        // Update the Birb's position accross each tick
        const newY = s.birb.birbY + fall_rate;
        return {
            ...s,
            birb: {
                ...s.birb,
                birbVelocity: fall_rate,
                birbY: newY,
            },
        };
    }
}

/**
 * This class creates a pipe at the right side of the Canvas with given properties (gap center/height)
 * Increment objCount everytime a pipe is created to ensure the unique ID
 */
class CreatePipe implements Action {
    constructor(
        public readonly gapY: number,
        public readonly gapH: number,
    ) {}
    apply(s: State): State {
        const id = `pipe-${s.objCount + 1}`; //Ensure unique ID
        const pipe: Game.Pipe = {
            id,
            x: Game.Viewport.CANVAS_WIDTH,
            gapY: this.gapY,
            gapH: this.gapH,
            createTime: s.time,
            passed: false, //Set false because the Birb has not passed through the Pipe
        } as const;

        return {
            ...s,
            objCount: s.objCount + 1,
            pipes: [...s.pipes, pipe],
        };
    }
}

/**
 * This class handles the moving of the Pipe, scoring of the Birb, and detecting victory
 */
class TickPipes implements Action {
    constructor(private readonly dtMs = Game.Constants.TICK_RATE_MS) {}

    apply(s: State): State {
        const dx = Game.Constants.PIPE_SPEED_PX_PER_MS * this.dtMs;

        // Move the pipes to the left by dx
        const moved = s.pipes.map(p => ({ ...p, x: p.x - dx }));

        // Remove the pipes that are off the screen (moved all the way to the left side already)
        const kept = moved.filter(p => p.x + Game.Constants.PIPE_WIDTH > 0);

        /**
         * This part handles the scoring logic
         * This works by check if the Birb X position has passed through the Pipe's right edge (indicating the Birb is all the way through)
         * In addition, the Birb cannot have invincibility when passing through
         */

        const birdX = s.birb.birbX;

        // Check if the Birb is inside the Gap
        const insideGap = (py: number, p: Game.Pipe) =>
            py > p.gapY - p.gapH / 2 && py < p.gapY + p.gapH / 2;

        // Check for the Birb's invincibility, if Birb doesn't have it then TRUE and okToScore
        const okToScore =
            s.invincibleUntil === undefined || s.time >= s.invincibleUntil;

        // This is the logic for when the Birb crossed the edge and score
        const { pipes: updated, gained } = kept.reduce(
            (acc, p) => {
                const currRight = p.x + Game.Constants.PIPE_WIDTH; // after move
                const prevRight = currRight + dx; // before move

                // true exactly on the tick where the right edge crosses the bird's x
                const crossedNow = prevRight >= birdX && currRight < birdX;

                // If all of the conditions are satisfied, it will be TRUE
                const scoredNow =
                    !p.passed &&
                    crossedNow &&
                    insideGap(s.birb.birbY, p) &&
                    okToScore;

                // If true, the Pipe's passed will be set to TRUE, else nothing will change
                const nextP = scoredNow ? { ...p, passed: true } : p;

                return {
                    // Keep building a new pipes array and a running gained total
                    pipes: [...acc.pipes, nextP],
                    gained: acc.gained + (scoredNow ? 1 : 0),
                };
            },

            // Afterward
            {
                pipes: [] as Game.Pipe[], // updated will have the new array of pipes (with the passed changes)
                gained: 0, // how many points to add to score in this tick
            },
        );

        // Update the new score
        const nextScore = s.score + gained;

        /**
         * This part handles the Win part, when the Birb has passed through all the pipes
         * resolved means a pipe is behind the bird's FRONT (the Birb has passed though)
         */
        const birbFrontX = s.birb.birbX + Game.Birb.WIDTH / 2;
        const resolved = (p: Game.Pipe) =>
            p.passed || p.x + Game.Constants.PIPE_WIDTH < birbFrontX;

        // There are pipes and all of them are behind/passed
        const allResolved = updated.length > 0 && updated.every(resolved);

        // Start win timer exactly once when the last unresolved pipe becomes resolved
        // I could have ended the Game here, but I wanted the Birb to keep going for a bit longer and then the Game will stop
        const winStarted = allResolved && s.winAt === undefined;

        // If win timer already started, check whether to end now
        const endAfterWin =
            s.winAt !== undefined &&
            s.time - s.winAt >= Game.Constants.WIN_DELAY_MS;

        return {
            ...s,
            pipes: updated,
            score: nextScore,
            // start the victory glide when all pipes resolved
            winAt: winStarted ? s.time : s.winAt,
            won: winStarted ? true : s.won,
            gameEnd: s.gameEnd || endAfterWin,
        };
    }
}

/**
 * This function is a reducer, it applies the action to produce a state, then immediately run handleCollisions which:
 * Deducts a life if you hit something
 * Applies a bounce + sets invincibleUntil
 * Ends the game if lives hit zero
 * @param s
 * @param action
 * @returns
 */
const reduceState = (s: State, action: Action) =>
    handleCollisions(action.apply(s));
