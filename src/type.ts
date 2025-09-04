export {Constants, Birb, Viewport}
export type { Key, Event, State, Action, Body, View, CsvRow, Pipe, Rect };

//CONSTANTS
// The overall dimensions of the SVG canvas
const Viewport = {
    CANVAS_WIDTH: 600,
    CANVAS_HEIGHT: 400,
} as const;

// The dimensions of the Birb
const Birb = {
    WIDTH: 42,
    HEIGHT: 30,
} as const;

// Game constants
const Constants = {
    PIPE_WIDTH: 60,
    TICK_RATE_MS: 30,
    GRAVITY: 1.5, 
    MAX_FALL_RATE: 18,
    INVINCIBLE_MS: 1000,
} as const;

//INPUT TYPES
// Keys that the game listens for
type Key = "Space" | "KeyR";

// DOM events captured from the keyboard
type Event = 'keydown' | 'keyup';

// Geometry Types
// A rectangle, used for collision detection
type Rect = Readonly<{ 
    x: number,
    y: number, 
    w: number,
    h: number,
}>

// Game Entities
// Stores the Birb position, velocity, remaining lives, and creation time
type Body = Readonly<{
    id: string,
    birbX: number,
    birbY: number,
    birbVelocity: number,
    birbLive: number,
    createTime: number,
}>

// A pipe with a vertical gap
// The `passed` attribute indicates whether the bird has successfully flown through it
type Pipe = Readonly<{
    id: string,
    x: number,
    gapY: number,
    gapH: number,
    createTime: number,
    passed: boolean,
}>

// Game State
// The immutable game state tracked on each tick
type State = Readonly<{
    gameEnd: boolean,
    time: number,
    pipes: readonly Pipe[],
    exit: readonly number[],
    birb: Body,
    objCount: number,
    score: number,
    invincibleUntil?: number,
    won?: boolean;
    winAt?: number;
}>;

// Render/View
// References to the SVG DOM elements needed for rendering
type View = Readonly<{
    svg: SVGSVGElement,
    birbImg: SVGImageElement,
}>

// Shape of each row from the input CSV
type CsvRow = { 
    gap: number,
    height: number,
    delay: number 
};

// Action interface
//  This handle user input, collisions
interface Action{
    apply(s:State): State;
}