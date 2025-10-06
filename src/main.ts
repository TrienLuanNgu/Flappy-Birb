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
import type {
    Key,
    Event,
    State,
    Action,
    Body,
    View,
    CsvRow,
    GhostFrame,
} from "./type";
import {
    Jump,
    reduceState,
    Gravity,
    CreatePipe,
    TickPipes,
    Tick,
    initialState,
} from "./state";
import {
    createGhostSprite,
    createSvgElement,
    drawGhost,
    GhostStore,
    initView,
    sampleGhost,
    isGhostOn,
} from "./view";

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

// Observable: wait for first user R
const start$ = observeKey(
    "keydown",
    "KeyR",
    () => true
)

/**
 * This is a render loop for the Game in each state
 * @returns The single effectful sink that observes State and mutates the DOM
 */
const render = (): ((s: State) => void) => {
    const v: View = initView();

    document // This part clears out all ghost bird elements currently on the canvas -> so the new run can starts clean
        .querySelectorAll<SVGGraphicsElement>("#svgCanvas .ghost")
        .forEach(n => n.remove());

    const run = {
        t0: null as number | null, // first state.time in this run
        x0: Game.Viewport.CANVAS_WIDTH * 0.3, // birb X used for ghosts
        ghostsInitialised: false,
    };

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

    // Idempotent creator/upserter for a pipe's rect pair (top/bottom).
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

    // This part is pure geometry -> attribute patching for a pipe at (x, gapY, gapH).
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
        if (run.t0 === null) {
            run.t0 = s.time;
            run.x0 = s.birb.birbX;

            // clear any previous ghost nodes
            document
                .querySelectorAll<SVGGraphicsElement>("#svgCanvas .ghost")
                .forEach(n => n.remove());

            GhostStore.currentRecording = [];
            GhostStore.sprites = [];

            if (isGhostOn()) {
                // If the isGhostOn is True then create/show ghost birbs
                // This part pushes the ghosts from the old run out 1 by 1 onto the canvas
                GhostStore.sessionGhosts.forEach(() => {
                    GhostStore.sprites.push(createGhostSprite(v.svg));
                });
                /**
                 * For example after 2 runs
                 * sessionGhosts = [
                 *      [ {t:0,y:200}, {t:30,y:190}, ... ], // run 1
                 *      [ {t:0,y:220}, {t:30,y:215}, ... ]  // run 2
                 * ]
                 */

                run.ghostsInitialised = true;
            } else {
                run.ghostsInitialised = false;
            }
        }

        // This part records the current frame (elapsed t, y)
        const t = s.time - (run.t0 ?? s.time);
        if (GhostStore.currentRecording) {
            // If the currentRecording is not null
            GhostStore.currentRecording.push({ t, y: s.birb.birbY }); // push in the time and Y position
        }

        if (isGhostOn()) {
            if (
                // The condition checks if
                run.ghostsInitialised && // Ghosts were properly initialised at the start of the run
                GhostStore.sprites.length === GhostStore.sessionGhosts.length // The number of ghost matches the number of stored ghost runs
            ) {
                // This loops over the past runs
                GhostStore.sessionGhosts.forEach((path, i) => {
                    const node = GhostStore.sprites[i];
                    if (!node) return; // If the sprite doesn't exist (it was removed earlier) -> skip this run
                    // it could be the ghost has finished replaying and we marked it as null

                    const endT = path.length ? path[path.length - 1].t : 0; // This finds the final timestamp of that ghost's recorded run
                    if (t > endT + 50) {
                        // Check if the current game time t has gone beyond the end of that run + 50ms
                        node.remove(); // We remove the ghost from the DOM
                        GhostStore.sprites[i] = null; // mark removed by setting its sprite to null
                        return;
                    }

                    const y = sampleGhost(path, t); // This searches through the recorded path and finds the correct Y pos for the current frame
                    if (y !== null) drawGhost(node, run.x0, y); //Finally, if a valid y position was found -> update the ghost sprite's coordinates
                });
            }
        } else {
            // If the false, remove any currently displayed ghosts once
            if (GhostStore.sprites.some(Boolean)) {
                document
                    .querySelectorAll<SVGGraphicsElement>("#svgCanvas .ghost")
                    .forEach(n => n.remove());
                GhostStore.sprites = [];
                run.ghostsInitialised = false;
            }
        }

        if (s.gameEnd) {
            // If the gameEnd is true, this part is cleaning up and reseting the ghosts
            if (
                GhostStore.currentRecording && // If currentRecording is not null
                GhostStore.currentRecording.length > 0 // Its length is > 0, means that the recording is valid
            ) {
                GhostStore.sessionGhosts.push(GhostStore.currentRecording); // Push it into the sessionGhost array
            }
            GhostStore.currentRecording = null; // The nset it to null, so a new recoding can be added in the future

            // Reset run markers so next run re-initialises
            run.t0 = null;
            run.ghostsInitialised = false;
            // run.x0 recomputed on next first frame
        }

        // See if the birb is invincible or not
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

        // This part loop through the array of pipe objects from the current game state and
        // updates or creates the corresponding SVG rectangles on the canvas for that pipe
        s.pipes.forEach(p => upsertPipe(p.id, p.x, p.gapY, p.gapH));

        // The map() part builds a list of all pipe ID that still exist in the current frame
        // and the remove() deletes any pipe DOM nodes that are not in that list anymore
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
    // Resolve the CSV via Vite so it works in dev and on GitHub Pages
    const csvUrl = new URL("../assets/map.csv", import.meta.url).href;

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

    csv$.pipe(
        switchMap(contents =>
            // Press R - start the game
            start$.pipe(switchMap(() => state$(contents))),
            
        ),
        takeWhile((s: State) => !s.gameEnd, true),
    )
        .pipe(repeat())
        .subscribe(render());
}
