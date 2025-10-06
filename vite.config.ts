import pluginChecker from "vite-plugin-checker";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [pluginChecker({ typescript: true, overlay: false })],
    // Use relative base so built assets work under any repo subpath on GitHub Pages
    base: './',
});
