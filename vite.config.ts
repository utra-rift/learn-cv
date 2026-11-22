import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

// Pyodide shares memory with the page (SharedArrayBuffer), which needs a
// cross-origin isolated page: these headers on every response in dev. In
// production, src/start.ts sets them on pages and public/_headers on files.
const ISOLATION = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "require-corp",
	"Cross-Origin-Resource-Policy": "same-origin",
};

/**
 * Monaco only runs in the browser, from dynamic imports. In the server build
 * its entry becomes a stub, so none of it is bundled into the Worker.
 */
function clientOnly(): Plugin {
	const PREFIX = "\0client-only:";
	const MONACO = path.join(root, "src/editor/monaco.ts");
	return {
		name: "client-only-modules",
		enforce: "pre",
		async resolveId(source, importer, options) {
			if (this.environment?.config.consumer !== "server") return null;
			if (!source.includes("editor/monaco")) return null;
			const resolved = await this.resolve(source, importer, {
				...options,
				skipSelf: true,
			});
			return resolved?.id === MONACO ? PREFIX + resolved.id : null;
		},
		load(id) {
			return id.startsWith(PREFIX)
				? "export function loadMonaco() { throw new Error('Monaco only runs in the browser.'); }"
				: null;
		},
	};
}

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
		alias: [
			// monaco-editor's exports map appends .js to every subpath, which breaks
			// its CSS imports. Point straight at the ESM tree instead.
			{
				find: /^monaco-esm\/(.*)$/,
				replacement: path.join(root, "node_modules/monaco-editor/esm/vs/$1"),
			},
		],
	},
	server: { headers: ISOLATION, port: 3000 },
	preview: { headers: ISOLATION },
	worker: { format: "es" },
	plugins: [
		clientOnly(),
		// Builds the server for Cloudflare Workers (wrangler.jsonc) and runs it
		// in workerd during dev and preview, like production.
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});
