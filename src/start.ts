import { createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

// Every page has to be cross-origin isolated so Pyodide and the camera can
// share memory (SharedArrayBuffer). Static files get the same headers from
// public/_headers, and /tools and /clips from src/server.ts.
const crossOriginIsolation = createMiddleware().server(({ next }) => {
	setResponseHeader("Cross-Origin-Opener-Policy", "same-origin");
	setResponseHeader("Cross-Origin-Embedder-Policy", "require-corp");
	return next();
});

export const startInstance = createStart(() => ({
	requestMiddleware: [crossOriginIsolation],
}));
