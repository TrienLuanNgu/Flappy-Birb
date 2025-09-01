
import * as Game from "./type";
import { Key, Event, State, Action } from "./type";
import { handleCollisions } from "./collision";

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
        const pipe = {
            id,
            x: Game.Viewport.CANVAS_WIDTH,
            gapY: this.gapY,
            gapH: this.gapH,
            createTime: s.time,
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
        const moved = s.pipes.map(p => ({ ...p, x: p.x - dx }));
        const kept = moved.filter(p => p.x + Game.Constants.PIPE_WIDTH > 0);
        return { ...s, pipes: kept };
    }
}
