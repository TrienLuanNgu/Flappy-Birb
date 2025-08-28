export {Constants, Birb, Viewport}
export type {Key, Event, State, Action}

const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
} as const;

const Constants = {
    PIPE_WIDTH: 50,
    TICK_RATE_MS: 500, // Might need to change this!
} as const;

type Key = "Space" | "KeyR";

type Event = 'keydown' | 'keyup';

// State processing

type State = Readonly<{
    gameEnd: boolean;
    birdX: number;
    birbY: number;
    birbVelocity: number;
    birbLive: number;
}>;

interface Action{
    apply(s:State): State;
}