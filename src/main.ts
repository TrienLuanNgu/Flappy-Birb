/**
 * Inside this file you will use the classes and functions from rx.js
 * to add visuals to the svg element in index.html, animate them, and make them interactive.
 *
 * Study and complete the tasks in observable exercises first to get ideas.
 *
 * Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
 *
 * You will be marked on your functional programming style
 * as well as the functionality that you implement.
 *
 * Document your code!
 */

import "./style.css";

import {
    Observable,
    Subscription,
    catchError,
    filter,
    from,
    fromEvent,
    interval,
    map,
    merge,
    mergeMap,
    repeat,
    scan,
    startWith,
    switchMap,
    take,
    takeWhile,
    tap,
    timer,
    zip,
} from "rxjs";
import { fromFetch } from "rxjs/fetch";

import * as Game from "./type";
import type { Key, Event, State, Action, Body, View, CsvRow } from "./type";
import {
    Jump,
    reduceState,
    Gravity,
    CreatePipe,
    TickPipes,
    Tick,
} from "./state";

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


// Rendering (side effects)

/**
 * Brings an SVG element to the foreground.
 * @param elem SVG element to bring to the foreground
 */
const bringToForeground = (elem: SVGElement): void => {
    elem.parentNode?.appendChild(elem);
};

/**
 * Displays a SVG element on the canvas. Brings to foreground.
 * @param elem SVG element to display
 */
const show = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "visible");
    bringToForeground(elem);
};

/**
 * Hides a SVG element on the canvas.
 * @param elem SVG element to hide
 */
const hide = (elem: SVGElement): void => {
    elem.setAttribute("visibility", "hidden");
};

/**
 * This is a generic, reusable HOF that turns a DOM key event into a typed stream of values
 * @param eventName
 * @param k
 * @param result
 * @returns an Observable preserves purity until subscribed
 */
const observeKey = <T>(eventName: Event, k: Key, result: () => T) =>
    fromEvent<KeyboardEvent>(document, eventName).pipe(
        filter(({ code }) => code === k),
        filter(({ repeat }) => !repeat),
        map(result),
    );

/**
 * This is an input stream (pure Producers of Actions)
 * Using constants keeps magic numbers out of logic and supports difficulty tuning
 */
const jump$ = observeKey(
    "keydown",
    "Space",
    () => new Jump(Game.Constants.JUMP_VELOCITY),
);

// Continuous gravity ticks at fixed cadence, pure Action objects
const gravity$ = interval(Game.Constants.TICK_RATE_MS).pipe(
    map(() => new Gravity()),
);

// Pipe movement and scoring tick (separate from gravity for clarity)
const tickPipes$ = interval(Game.Constants.TICK_RATE_MS).pipe(
    map(() => new TickPipes()),
);

// Logical time tick (advances s.time)
const time$ = interval(Game.Constants.TICK_RATE_MS).pipe(map(() => new Tick()));

/**
 * Creates an SVG element with the given properties.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/SVG/Element for valid
 * element names and properties.
 *
 * @param namespace Namespace of the SVG element
 * @param name SVGElement name
 * @param props Properties to set on the SVG element
 * @returns SVG element
 */
const createSvgElement = (
    namespace: string | null,
    name: string,
    props: Record<string, string> = {},
): SVGElement => {
    const elem = document.createElementNS(namespace, name) as SVGElement;
    Object.entries(props).forEach(([k, v]) => elem.setAttribute(k, v));
    return elem;
};

/**
 * This function initial view creation.
 * Kept separate from render loop so DOM nodes are created once 
 * and updated thereafter (better performance & cleaner logic)
 */
const initView = (): View => {
    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;
    svg.setAttribute(
        "viewBox",
        `0 0 ${Game.Viewport.CANVAS_WIDTH} ${Game.Viewport.CANVAS_HEIGHT}`,
    );

    const birbImg = createSvgElement(svg.namespaceURI, "image", {
        href: "assets/birb.png",
        width: String(Game.Birb.WIDTH),
        height: String(Game.Birb.HEIGHT),
        x: String(Game.Viewport.CANVAS_WIDTH * 0.3 - Game.Birb.WIDTH / 2),
        y: String(Game.Viewport.CANVAS_HEIGHT / 2 - Game.Birb.HEIGHT / 2),
    }) as SVGImageElement;

    svg.appendChild(birbImg);
    return { svg, birbImg };
};

/**
 * 
 * @returns The single effectful sink that observes State and mutates the DOM
 */
const render = (): ((s: State) => void) => {
    const v: View = initView();

    // Canvas elements
    const gameOver = document.querySelector("#gameOver") as SVGElement;
    const container = document.querySelector("#main") as HTMLElement;

    // Text fields
    const livesText = document.querySelector("#livesText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;
    const gameOverText = gameOver.querySelector("text") as SVGTextElement;

    // Dedicated layer for pipes to avoid z-index concerns
    const pipesLayer = createSvgElement(
        v.svg.namespaceURI,
        "g",
        {},
    ) as SVGGElement;
    v.svg.appendChild(pipesLayer);

    // Keep a map of pipe id -> rects so we can patch instead of recreate
    const pipeElems = new Map<
        string,
        { top: SVGRectElement; bottom: SVGRectElement }
    >();

    /** Idempotent creator/upserter for a pipe's rect pair (top/bottom). */
    const creatingPipePair = (id: string) => {
        const found = pipeElems.get(id);
        if (found) return found;

        const top = createSvgElement(v.svg.namespaceURI, "rect", {
            fill: "green",
        }) as SVGRectElement;
        const bottom = createSvgElement(v.svg.namespaceURI, "rect", {
            fill: "green",
        }) as SVGRectElement;
        pipesLayer.appendChild(top);
        pipesLayer.appendChild(bottom);

        const created = { top, bottom } as const;
        pipeElems.set(id, created);
        return created;
    };

    /** Pure geometry → attribute patching for a pipe at (x, gapY, gapH). */
    const upsertPipe = (id: string, x: number, gapY: number, gapH: number) => {
        const pair = creatingPipePair(id);

        const topH = Math.max(0, gapY - gapH / 2);
        const bottomY = gapY + gapH / 2;
        const bottomH = Math.max(0, Game.Viewport.CANVAS_HEIGHT - bottomY);

        pair.top.setAttribute("x", String(x));
        pair.top.setAttribute("y", "0");
        pair.top.setAttribute("width", String(Game.Constants.PIPE_WIDTH));
        pair.top.setAttribute("height", String(topH));

        pair.bottom.setAttribute("x", String(x));
        pair.bottom.setAttribute("y", String(bottomY));
        pair.bottom.setAttribute("width", String(Game.Constants.PIPE_WIDTH));
        pair.bottom.setAttribute("height", String(bottomH));
    };

    /**
     * Remove any pipe DOM nodes that are no longer present in State.
     * This keeps view in sync with model (functional “diffing” style).
   */
    const removePipes = (id: readonly string[]) => {
        const inCanvas = new Set(id);
        for (const [id, pair] of pipeElems) {
            if (!inCanvas.has(id)) {
                pair.top.remove();
                pair.bottom.remove();
                pipeElems.delete(id);
            }
        }
    };

    return (s: State) => {
        const invincible =
            s.invincibleUntil !== undefined && s.time < s.invincibleUntil;

        // Birb position
        v.birbImg.setAttribute("x", String(s.birb.birbX - Game.Birb.WIDTH / 2));
        v.birbImg.setAttribute(
            "y",
            String(s.birb.birbY - Game.Birb.HEIGHT / 2),
        );

        // Flicker opacity while invincible
        v.birbImg.setAttribute(
            "opacity",
            invincible ? (Math.floor(s.time / 100) % 2 ? "0.4" : "1") : "1",
        );

        s.pipes.forEach(p => upsertPipe(p.id, p.x, p.gapY, p.gapH));
        removePipes(s.pipes.map(p => p.id));

        // HUD fields
        livesText.textContent = String(s.birb.birbLive);
        scoreText.textContent = String(s.score);
        if (s.gameEnd) {
            gameOverText.textContent = s.won ? "You Win!" : "Game Over";
            gameOver.setAttribute("visibility", "visible");
            gameOver.parentNode?.appendChild(gameOver);
        } else {
            gameOver.setAttribute("visibility", "hidden");
        }
    };
};

/**
 * Build the State machine as an Observable by merging independent streams
 * of Actions and folding them with the pure reducer (`reduceState`).
 */
export const state$ = (csvContents: string): Observable<State> => {
    const rows = parseCsv(csvContents);

    // Independent action streams:
    // - bird movement intents and physics/time ticks
    const birdMovement$ = merge(jump$, gravity$, time$);

    // - pipe creation intents (timed from CSV spec)
    const pipeActions$ = makePipeActions$(rows);

    // Seed initial State deterministically
    const seed: State = initialState(
        performance.now(),
        Game.Viewport.CANVAS_WIDTH,
        Game.Viewport.CANVAS_HEIGHT,
    );

    // Merge all Actions and fold to State
    return merge(birdMovement$, pipeActions$, tickPipes$).pipe(
        startWith({ apply: (s: State) => s } as Action),
        scan(reduceState, seed),
    );
};

// Pure CSV → rows parse
// Keeping this pure makes it easy to unit test
const parseCsv = (text: string): CsvRow[] =>
    text
        .trim()
        .split("\n")
        .map(line => {
            const [gap_y, gap_height, time] = line.split(",");
            return {
                gap: Number(gap_y),
                height: Number(gap_height),
                delay: Number(time),
            };
        });

/**
 * Pure builder of a timed pipe-creation Action stream from row specs.
 * Uses `mergeMap(timer)` so each row schedules its own CreatePipe event.
 */
const makePipeActions$ = (rows: CsvRow[]) => {
    const toPx = (fraction: number) => fraction * Game.Viewport.CANVAS_HEIGHT;
    return from(rows).pipe(
        mergeMap(({ gap, height, delay }) =>
            timer(delay * 1000).pipe(
                map(() => new CreatePipe(toPx(gap), toPx(height))),
            ),
        ),
    );
};

// The following simply runs your main function on window load.  Make sure to leave it in place.
// You should not need to change this, beware if you are.
if (typeof window !== "undefined") {
    const { protocol, hostname, port } = new URL(import.meta.url);
    const baseUrl = `${protocol}//${hostname}${port ? `:${port}` : ""}`;
    const csvUrl = `${baseUrl}/assets/map.csv`;

    // Get the file from URL
    const csv$ = fromFetch(csvUrl).pipe(
        switchMap(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`Fetch error: ${response.status}`);
            }
        }),
        catchError(err => {
            console.error("Error fetching the CSV file:", err);
            throw err;
        }),
    );

    // Observable: wait for first user click
    const click$ = fromEvent(document.body, "mousedown").pipe(take(1));

    csv$.pipe(
        switchMap(contents =>
            // On click - start the game
            click$.pipe(switchMap(() => state$(contents))),
        ),
        takeWhile((s: State) => !s.gameEnd, true),
    )
        .pipe(repeat())
        .subscribe(render());
}
