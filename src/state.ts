
import * as Game from "./type";
import { Key, Event, State, Action } from "./type";

export {Jump, reduceState}

class Jump implements Action{
    constructor(public readonly velocity: number){}
    apply(s:State): State {
        return {
            ...s, 
            birbY: s.birbY + this.velocity
        };
    }
    
}

const reduceState = (s: State, action: Action) => action.apply(s);