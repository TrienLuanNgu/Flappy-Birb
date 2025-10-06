import { View, GhostFrame } from "./type";
import * as Game from "./type";
import birbPng from '../assets/birb.png';

export {
    createSvgElement,
    initView,
    GhostStore,
    createGhostSprite,
    drawGhost,
    sampleGhost,
    isGhostOn,
};
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
 * and updated thereafter (better performance and cleaner logic)
 */
const initView = (): View => {
    const svg = document.querySelector("#svgCanvas") as SVGSVGElement;
    svg.setAttribute(
        "viewBox",
        `0 0 ${Game.Viewport.CANVAS_WIDTH} ${Game.Viewport.CANVAS_HEIGHT}`,
    );

    const birbImg = createSvgElement(svg.namespaceURI, "image", {
        href: birbPng,
        width: String(Game.Birb.WIDTH),
        height: String(Game.Birb.HEIGHT),
        x: String(Game.Viewport.CANVAS_WIDTH * 0.3 - Game.Birb.WIDTH / 2),
        y: String(Game.Viewport.CANVAS_HEIGHT / 2 - Game.Birb.HEIGHT / 2),
    }) as SVGImageElement;

    svg.appendChild(birbImg);
    return { svg, birbImg };
};

const GhostStore = {
    sessionGhosts: [] as GhostFrame[][], // an array of all previous runs
    currentRecording: null as GhostFrame[] | null, // the frames for the run that’s currently happening
    sprites: [] as (SVGImageElement | null)[], // the actual DOM nodes drawn on screen to replay ghosts
};

/**
 * This function creates a visual for one ghost
 * The ghost is semi-transparent
 * @param svg
 * @returns the element so the caller can position it and keep a reference in GhostStore.sprites[i]
 */
function createGhostSprite(svg: SVGSVGElement): SVGImageElement {
    const img = document.createElementNS(
        svg.namespaceURI,
        "image",
    ) as SVGImageElement;
    img.setAttribute("href", birbPng);
    img.setAttribute("width", String(Game.Birb.WIDTH));
    img.setAttribute("height", String(Game.Birb.HEIGHT));
    img.setAttribute("opacity", "0.45"); // semi-transparent
    img.classList.add("ghost");
    img.style.pointerEvents = "none";
    svg.appendChild(img);
    return img;
}

/**
 * This function positions a ghost image so that its center sits at (x, y)
 * We subtract half the width/height because SVG image x/y is the top-left corner (like the real birb)
 * @param g
 * @param x
 * @param y
 */
function drawGhost(g: SVGImageElement, x: number, y: number) {
    g.setAttribute("x", String(x - Game.Birb.WIDTH / 2));
    g.setAttribute("y", String(y - Game.Birb.HEIGHT / 2));
}

/**
 * This function find the last frame whose timestamp f.t is <= t
 * Given a path and elapsed time t (ms), return the y at or before t
 * @param path
 * @param t
 * @returns that frame's y so the ghost shows where the prior run's bird was at the same moment in its run
 */
function sampleGhost(path: GhostFrame[], t: number): number | null {
    if (path.length === 0) return null;
    const idx = path.reduce((acc, f, i) => (f.t <= t ? i : acc), -1);
    return idx >= 0 ? path[idx].y : path[0].y;
}

const isGhostOn = (): boolean =>
    (document.getElementById("ghostToggle") as HTMLInputElement)?.checked ??
    true;
