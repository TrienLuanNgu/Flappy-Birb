export {Constants, Birb, Viewport}
export type { Key, Event, State, Action, Body, View, CsvRow, Pipe, Rect };

const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
} as const;

const Constants = {
    PIPE_WIDTH: 60,
    TICK_RATE_MS: 30, // Might need to change this!
    GRAVITY: 1.5, 
    MAX_FALL_RATE: 18,
    INVINCIBLE_MS: 1000,
} as const;

type Key = "Space" | "KeyR";

type Event = 'keydown' | 'keyup';

// State processing

type Rect = Readonly<{ 
    x: number,
    y: number, 
    w: number,
    h: number,
}>

type Body = Readonly<{
    id: string,
    birbX: number,
    birbY: number,
    birbVelocity: number,
    birbLive: number,
    createTime: number,
}>

type Pipe = Readonly<{
    id: string,
    x: number,
    gapY: number,
    gapH: number,
    createTime: number,
    passed: boolean,
}>

type State = Readonly<{
    gameEnd: boolean,
    time: number,
    pipes: readonly Pipe[],
    exit: readonly number[],
    birb: Body,
    objCount: number,
    score: number,
    invincibleUntil?: number,
}>;

type View = Readonly<{
    svg: SVGSVGElement,
    birbImg: SVGImageElement,
}>

type CsvRow = { 
    gap: number,
    height: number,
    delay: number 
};

interface Action{
    apply(s:State): State;
}