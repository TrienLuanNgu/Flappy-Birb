
import * as Game from "./type";
import { Key, Event, State, Action } from "./type";
import { handleCollisions } from "./collision";
import { delay } from "rxjs";

export {Jump, reduceState, Gravity, CreatePipe, TickPipes, Tick}

class Tick implements Action {
    constructor(private readonly dt = Game.Constants.TICK_RATE_MS) {}
    apply(s: State): State {
        return { ...s, time: s.time + this.dt };
    }
}

class Jump implements Action{
    constructor(public readonly velocity: number){}
    apply(s:State): State {
        return {
            ...s, 
            birb: {...s.birb, birbVelocity: -this.velocity}
        };
    }
}

const reduceState = (s: State, action: Action) => handleCollisions(action.apply(s));

class Gravity implements Action{
    apply(s:State): State {
        const fall_rate = Math.min(
            s.birb.birbVelocity + Game.Constants.GRAVITY, 
            Game.Constants.MAX_FALL_RATE
        );

        const newY = s.birb.birbY + fall_rate;
        return {
            ...s,
            birb:{
                ...s.birb,
                birbVelocity: fall_rate,
                birbY: newY,
            }
        }
    }
}

class CreatePipe implements Action {
    constructor (public readonly gapY: number, public readonly gapH: number){}
    apply(s:State): State {
        const id = `pipe-${s.objCount + 1}`;
        const pipe: Game.Pipe = {
            id,
            x: Game.Viewport.CANVAS_WIDTH,
            gapY: this.gapY,
            gapH: this.gapH,
            createTime: s.time,
            passed: false,
        } as const;

        return { 
            ...s, 
            objCount: s.objCount + 1, 
            pipes: [...s.pipes, pipe] 
        };
    }
}

class TickPipes implements Action {
    private readonly speedPxPerMs = 0.12;
    constructor(private readonly dtMs = Game.Constants.TICK_RATE_MS) {}

    apply(s: State): State {
        const dx = this.speedPxPerMs * this.dtMs;
        const moved = s.pipes
            .map(p => ({ ...p, x: p.x - dx }))

        const kept = moved.filter(p => p.x + Game.Constants.PIPE_WIDTH > 0);

        const birdX = s.birb.birbX;
        const insideGap = (py: number, p: Game.Pipe) =>
        py > (p.gapY - p.gapH / 2) && py < (p.gapY + p.gapH / 2);

        
        const okToScore = s.invincibleUntil === undefined || s.time >= s.invincibleUntil;

        // 3) edge-crossing scoring
        const { pipes: updated, gained } = kept.reduce(
            (acc, p) => {
                const currRight = p.x + Game.Constants.PIPE_WIDTH; // after move
                const prevRight = currRight + dx;                   // before move

                // true exactly on the tick where the right edge crosses the bird's x
                const crossedNow = prevRight >= birdX && currRight < birdX;

                const scoredNow =
                !p.passed && crossedNow && insideGap(s.birb.birbY, p) && okToScore;

                const nextP = scoredNow ? { ...p, passed: true } : p;

                return {
                    pipes: [...acc.pipes, nextP],
                    gained: acc.gained + (scoredNow ? 1 : 0),
                };
            },
                { 
                    pipes: [] as Game.Pipe[],
                    gained: 0 
                }
            );

        // return { ...s, pipes: updated, score: s.score + gained };
        // const allResolved = updated.length > 0 &&
        //     updated.every(p => p.passed || (p.x + Game.Constants.PIPE_WIDTH) < (s.birb.birbX + Game.Birb.WIDTH/2));
        const nextScore = s.score + gained;
        

        // 4) end the run when every pipe is resolved (passed or gone behind)
        // return {
        //     ...s,
        //     pipes: updated,
        //     score: nextScore,
        //     gameEnd: s.gameEnd || allResolved,
        // };

        const birbFrontX = s.birb.birbX + Game.Birb.WIDTH / 2; // use birbX directly if it's already the front
        const resolved = (p: Game.Pipe) =>
        p.passed || (p.x + Game.Constants.PIPE_WIDTH) < birbFrontX;

        const allResolved = updated.length > 0 && updated.every(resolved);

        // Only start the victory timer once
        const winStarted = allResolved && s.winAt === undefined;

        // Delay before we actually stop (birb keeps flying)
        const WIN_DELAY_MS = 2000; // tweak to taste

        // If win timer already started, check whether to end now
        const endAfterWin = s.winAt !== undefined && (s.time - s.winAt) >= WIN_DELAY_MS;

        return {
            ...s,
            pipes: updated,
            score: nextScore,
            // start the victory glide when all pipes resolved
            winAt: winStarted ? s.time : s.winAt,
            won: winStarted ? true : s.won,
            // end only after the glide delay (death uses different path)
            gameEnd: s.gameEnd || endAfterWin,
        };
    }
}