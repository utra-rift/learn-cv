import { useSyncExternalStore } from "react";
import { type CvRuntime, getRuntime } from "#/runtimes/cv/client";

/** The page's runtime, re-rendering on any change to its status, run state or windows. */
export function useRuntime(): CvRuntime {
	const runtime = getRuntime();
	useSyncExternalStore(
		(listener) => runtime.subscribe(listener),
		() => runtime.version,
		() => 0,
	);
	return runtime;
}
