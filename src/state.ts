
import * as Game from "./type";
import { Key, Event, State, Action } from "./type";

export {Jump, reduceState, Gravity}

class Jump implements Action{
    constructor(public readonly velocity: number){}
    apply(s:State): State {
        return {
            ...s, 
            birb: {...s.birb, birbVelocity: -this.velocity}
        };
    }
}

const reduceState = (s: State, action: Action) => action.apply(s);

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