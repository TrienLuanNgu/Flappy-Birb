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
    scan,
    startWith,
    switchMap,
    take,
    tap,
    timer,
    zip,
} from "rxjs";
import { fromFetch } from "rxjs/fetch";

import * as Game from "./type";
import type { Key, Event, State, Action, Body, View, CsvRow} from "./type";
import { Jump, reduceState, Gravity, CreatePipe, TickPipes, Tick } from "./state";

/** Constants */



// User input

function createBirb(
    id: string,
    x: number,
    y: number,
    createdAt: number,
    lives = 100
):Body{
    return {
        id,
        birbX: x,
        birbY: y,
        birbVelocity: 0,
        birbLive: lives,
        createTime: createdAt,
    }
}

const initialState = (t0: number, canvasW: number, canvasH: number): State => ({
    gameEnd: false,
    time: t0,
    pipes: [],
    exit: [],
    objCount: 0,
    score: 0,
    birb: createBirb(
        "birb",
        canvasW * 0.3,
        canvasH / 2,
        t0
    ),
});

/**
 * Updates the state by proceeding with one time step.
 *
 * @param s Current state
 * @returns Updated state
 */
const tick = (s: State) => s;

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
 * 
 * @param eventName 
 * @param k 
 * @param result 
 * @returns 
 */
const observeKey = <T>(eventName: Event, k: Key, result: ()=> T)=>
    fromEvent<KeyboardEvent>(document,eventName)
    .pipe(
        filter(({code})=>code === k),
        filter(({repeat})=>!repeat),
        map(result));


const jump$ = observeKey('keydown', "Space",() => new Jump(10));
const gravity$ = interval(Game.Constants.TICK_RATE_MS).pipe(
    map(() => new Gravity()) 
)

const tickPipes$ = interval(Game.Constants.TICK_RATE_MS).pipe(
    map(() => new TickPipes())
);

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

const initView = (): View => {
    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;
    svg.setAttribute(
        "viewBox",
        `0 0 ${Game.Viewport.CANVAS_WIDTH} ${Game.Viewport.CANVAS_HEIGHT}`
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

const render = (): ((s: State) => void) => {
    const v: View = initView();

    // Canvas elements
    const gameOver = document.querySelector("#gameOver") as SVGElement;
    const container = document.querySelector("#main") as HTMLElement;

    // Text fields
    const livesText = document.querySelector("#livesText") as HTMLElement;
    const scoreText = document.querySelector("#scoreText") as HTMLElement;

    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;

    svg.setAttribute(
        "viewBox",
        `0 0 ${Game.Viewport.CANVAS_WIDTH} ${Game.Viewport.CANVAS_HEIGHT}`,
    );

    const pipesLayer = createSvgElement(v.svg.namespaceURI, "g", {}) as SVGGElement;
    v.svg.appendChild(pipesLayer);

    const pipeElems = new Map<string, { top: SVGRectElement; bottom: SVGRectElement }>();

    const creatingPipePair = (id: string) => {
        const found = pipeElems.get(id);
        if (found) return found;

        const top = createSvgElement(v.svg.namespaceURI, "rect", { fill: "green" }) as SVGRectElement;
        const bottom = createSvgElement(v.svg.namespaceURI, "rect", { fill: "green" }) as SVGRectElement;
        pipesLayer.appendChild(top);
        pipesLayer.appendChild(bottom);

        const created = { top, bottom } as const;
        pipeElems.set(id, created);
        return created;
    };

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
        const invincible = s.invincibleUntil !== undefined && s.time < s.invincibleUntil;
        
        v.birbImg.setAttribute("x", String(s.birb.birbX - Game.Birb.WIDTH / 2));
        v.birbImg.setAttribute("y", String(s.birb.birbY - Game.Birb.HEIGHT / 2));

        v.birbImg.setAttribute("opacity", invincible ? ((Math.floor(s.time / 100) % 2) ? "0.4" : "1") : "1");

        s.pipes.forEach(p => upsertPipe(p.id, p.x, p.gapY, p.gapH));
        removePipes(s.pipes.map(p => p.id));

        livesText.textContent = String(s.birb.birbLive);
    };
};

export const state$ = (csvContents: string): Observable<State> => {
    /** User input */

    const key$ = fromEvent<KeyboardEvent>(document, "keypress");
    const fromKey = (keyCode: Key) =>
        key$.pipe(filter(({ code }) => code === keyCode));

    /** Determines the rate of time steps */
    const tick$ = interval(Game.Constants.TICK_RATE_MS);

    const birdMovement$ = merge(jump$, gravity$, time$);
    const pipeActions$  = makePipeActions$(csvContents);

    const seed: State = initialState(
        performance.now(),
        Game.Viewport.CANVAS_WIDTH,
        Game.Viewport.CANVAS_HEIGHT
    );
    return merge(birdMovement$, pipeActions$, tickPipes$).pipe(
        startWith({apply: (s:State) => s} as Action),
        scan(reduceState, seed)
    )
};


const parseCsv = (text: string): CsvRow[] =>
    text.trim().split("\n").map(line => {
        const [gap_y, gap_height, time] = line.split(",");
        return { gap: Number(gap_y), height: Number(gap_height), delay: Number(time) };
});

const makePipeActions$ = (csvContents: string) => {
    const rows = parseCsv(csvContents);
    const toPx = (fraction: number) => fraction * Game.Viewport.CANVAS_HEIGHT;
    return from(rows).pipe(
        mergeMap(({ gap, height, delay }) =>
        timer(delay * 1000).pipe(map(() => new CreatePipe(toPx(gap), toPx(height))))
        )
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
    ).subscribe(render());
}
