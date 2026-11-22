// Keeps the toolchain and the clips after the first visit, so a second visit
// works on bad venue Wi-Fi. Their paths carry versions, so cache-first is safe.
// Everything else goes to the network as usual.

const CACHE = "learn-cv-files-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith("learn-cv-") && key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
	if (!url.pathname.startsWith("/tools/") && !url.pathname.startsWith("/clips/")) return;
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const hit = await cache.match(event.request);
			if (hit) return hit;
			const response = await fetch(event.request);
			if (response.ok && response.status === 200) {
				await cache.put(event.request, response.clone());
			}
			return response;
		})(),
	);
});
