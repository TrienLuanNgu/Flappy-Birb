import { View, GhostFrame } from "./type";
import * as Game from "./type";

export {
    createSvgElement,
    initView,
    GhostStore,
    createGhostSprite,
    drawGhost,
    sampleGhost,
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

const GhostStore = {
    sessionGhosts: [] as GhostFrame[][], // all previous runs
    currentRecording: null as GhostFrame[] | null, // frames of this run
    sprites: [] as (SVGImageElement | null)[], // DOM nodes for this run's ghosts
};

// Create a ghost sprite as an <image> (same art as the real birb)
function createGhostSprite(svg: SVGSVGElement): SVGImageElement {
    const img = document.createElementNS(
        svg.namespaceURI,
        "image",
    ) as SVGImageElement;
    // SVG2 uses plain 'href' (no xlink)
    img.setAttribute("href", "assets/birb.png");
    img.setAttribute("width", String(Game.Birb.WIDTH));
    img.setAttribute("height", String(Game.Birb.HEIGHT));
    img.setAttribute("opacity", "0.45"); // semi-transparent
    img.classList.add("ghost");
    img.style.pointerEvents = "none";
    svg.appendChild(img);
    return img;
}

// Center like your real bird
function drawGhost(g: SVGImageElement, x: number, y: number) {
    g.setAttribute("x", String(x - Game.Birb.WIDTH / 2));
    g.setAttribute("y", String(y - Game.Birb.HEIGHT / 2));
}

// Given a path and elapsed time t (ms), return the y at or before t
function sampleGhost(path: GhostFrame[], t: number): number | null {
    if (path.length === 0) return null;
    // index of the last frame with time <= t, no `let`
    const idx = path.reduce((acc, f, i) => (f.t <= t ? i : acc), -1);
    return idx >= 0 ? path[idx].y : path[0].y;
}
