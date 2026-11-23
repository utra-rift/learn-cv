import {
	createRootRoute,
	HeadContent,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { DevTools } from "#/components/site/DevTools";
import { MobileWarning } from "#/components/site/MobileWarning";
import { storage, useStored } from "#/lib/storage";

import appCss from "../styles.css?url";

// Runs before first paint so a projector never flashes the light theme.
const THEME_SCRIPT = `try{var q=location.search;if(/[?&]projector=1/.test(q))localStorage.setItem("cv:projector","true");if(/[?&]projector=0/.test(q))localStorage.removeItem("cv:projector");if(localStorage.getItem("cv:projector")==="true")document.documentElement.dataset.theme="dark"}catch(e){}`;

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ name: "theme-color", content: "#F4FBFC" },
			{ title: "Learn CV · RIFT" },
			{
				name: "description",
				content:
					"Build an object tracker and a finger counter with real OpenCV in your browser, then point it at armor plates.",
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" data-theme="light" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed inline script */}
				<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
				<HeadContent />
			</head>
			<body>
				<Settings />
				<MobileWarning />
				{children}
				<DevTools />
				<Scripts />
			</body>
		</html>
	);
}

/**
 * ?instructor=1 and ?projector=1 on any page set lasting preferences (0 turns
 * them off). Keeps the page's theme in step with the projector setting, and
 * registers the service worker that keeps the toolchain for the next visit.
 */
function Settings() {
	const search = useRouterState({ select: (s) => s.location.searchStr });
	useEffect(() => {
		const params = new URLSearchParams(search);
		const instructor = params.get("instructor");
		if (instructor === "1") storage.setInstructor(true);
		if (instructor === "0") storage.setInstructor(false);
		const projector = params.get("projector");
		if (projector === "1") storage.setProjector(true);
		if (projector === "0") storage.setProjector(false);
	}, [search]);

	const projector = useStored(storage.isProjector, false);
	useEffect(() => {
		document.documentElement.dataset.theme = projector ? "dark" : "light";
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute("content", projector ? "#07101F" : "#F4FBFC");
	}, [projector]);

	useEffect(() => {
		if (import.meta.env.PROD && "serviceWorker" in navigator) {
			void navigator.serviceWorker.register("/sw.js").catch(() => {});
		}
	}, []);
	return null;
}
