import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Camera,
	CircleCheck,
	Download,
	LoaderCircle,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RunSheet } from "#/components/site/NotesList";
import { PresenterNotes } from "#/components/site/PresenterNotes";
import { SiteHeader } from "#/components/site/SiteHeader";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Progress } from "#/components/ui/progress";
import { LEVELS } from "#/levels";
import { inline } from "#/lib/rich-text";
import { storage, useStored } from "#/lib/storage";
import { cn } from "#/lib/utils";
import type { RuntimeStatus } from "#/runtimes/cv/client";
import { DOWNLOAD_SIZE } from "#/tools";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	// No level open: the presenter notes window shows the run sheet.
	useEffect(() => storage.setNotesLevel(null), []);
	const progress = useStored(storage.getProgress, {});
	const instructor = useStored(storage.isInstructor, false);
	const downloaded = useStored(storage.isDownloaded, false);
	const next = LEVELS.find((level) => !progress[level.number]) ?? LEVELS[0];
	const started = Object.keys(progress).length > 0;

	return (
		<div className="flex min-h-screen flex-col">
			<SiteHeader />
			<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-12 sm:px-8 sm:py-16">
				<section className="flex flex-col gap-5">
					<span className="type-label text-cyan-text">
						RIFT vision workshop
					</span>
					<h1 className="type-display-lg text-ink sm:type-display-xl">
						Learn CV
					</h1>
					<p className="type-body max-w-2xl text-ink-muted">
						Hold something bright up to your camera and build a tracker for it.
						First the basics: get a picture from the camera, and read the
						numbers inside it. Then a colour mask, a contour fit, a Kalman
						filter that keeps tracking while it's hidden, and a finger counter.
						You write ordinary OpenCV in Python, the same code that runs on a
						laptop or on the robot.
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<Button asChild variant="accent" size="lg">
							<Link to="/level/$levelId" params={{ levelId: next.id }}>
								{started ? `Continue at level ${next.number}` : "Start level 1"}
								<ArrowRight />
							</Link>
						</Button>
						<Button asChild variant="outline" size="lg">
							<Link to="/playground">Playground</Link>
						</Button>
					</div>
				</section>

				<section aria-labelledby="setup" className="flex flex-col gap-4">
					<h2 id="setup" className="type-label text-ink-muted">
						Before you start
					</h2>
					<div className="grid gap-4 md:grid-cols-3">
						<CameraCheck />
						<ToolchainCard downloaded={downloaded} />
						<div className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-5">
							<span className="type-display-sm text-ink">3. An object</span>
							<p className="type-body-sm text-ink-muted">
								Anything solid and brightly coloured: a tennis ball, a sticky
								note, a marker cap. Plain colours beat patterns. For level 6,
								sit in front of a plain wall.
							</p>
						</div>
					</div>
				</section>

				<section aria-labelledby="levels" className="flex flex-col gap-4">
					<h2 id="levels" className="type-label text-ink-muted">
						Levels
					</h2>
					<ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
						{LEVELS.map((level) => (
							<li key={level.id} className="bg-surface-raised">
								<Link
									to="/level/$levelId"
									params={{ levelId: level.id }}
									className="flex h-full flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface"
								>
									<span className="flex items-baseline gap-3">
										<span className="type-data text-ink-muted">
											{String(level.number).padStart(2, "0")}
										</span>
										<span className="type-label text-ink">{level.title}</span>
										<span className="ml-auto type-data text-[12px] text-ink-muted">
											{progress[level.number] ? (
												<span className="type-label text-[11px] text-cyan-text">
													Done
												</span>
											) : level.clips.length ? (
												`${level.minutes} min`
											) : (
												"demo"
											)}
										</span>
									</span>
									<span className="type-body-sm text-ink-muted">
										{inline(level.goal.split(". ")[0].replace(/\.$/, ""))}.
									</span>
								</Link>
							</li>
						))}
					</ol>
				</section>

				{instructor && (
					<PresenterNotes title="Presenter run sheet" className="gap-4 p-5">
						<RunSheet />
						<p className="type-body-sm text-ink-muted">
							Every level has presenter notes and the answer while instructor
							mode is on. Pop the notes out to keep them off a screen share. Use
							the moon button (or{" "}
							<code className="font-mono">?projector=1</code>) for the Arena
							theme on the projector, and click any window to show it
							fullscreen. <code className="font-mono">?instructor=0</code> turns
							this off.
						</p>
					</PresenterNotes>
				)}

				<footer className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 type-body-sm text-ink-muted">
					<span className="flex items-center gap-2">
						<ShieldCheck className="size-4 text-cyan" aria-hidden />
						Everything runs in this tab. Camera frames never leave your laptop.
					</span>
					<span>
						Sister app of{" "}
						<a
							href="https://github.com/utra-rift/pid-workshop"
							className="text-link underline-offset-4 hover:underline"
						>
							Learn PID
						</a>
						.
					</span>
				</footer>
			</main>
		</div>
	);
}

/** Allow the camera and see yourself, or find out what's wrong. */
function CameraCheck() {
	const video = useRef<HTMLVideoElement>(null);
	const [state, setState] = useState<"idle" | "asking" | "on" | "failed">(
		"idle",
	);
	const [error, setError] = useState("");
	const stream = useRef<MediaStream | null>(null);

	useEffect(
		() => () => {
			for (const track of stream.current?.getTracks() ?? []) track.stop();
		},
		[],
	);

	const start = async () => {
		setState("asking");
		const { openCameraStream, describeCameraError } = await import(
			"#/runtimes/cv/camera"
		);
		try {
			stream.current = await openCameraStream();
			if (video.current) {
				video.current.srcObject = stream.current;
				await video.current.play();
			}
			setState("on");
		} catch (e) {
			setError(describeCameraError(e));
			setState("failed");
		}
	};
	const stop = () => {
		for (const track of stream.current?.getTracks() ?? []) track.stop();
		stream.current = null;
		setState("idle");
	};

	return (
		<div className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-5">
			<div className="flex items-center justify-between gap-2">
				<span className="type-display-sm text-ink">1. Camera</span>
				{state === "on" && <Badge variant="cyan">Working</Badge>}
			</div>
			<div className="relative aspect-[4/3] overflow-hidden rounded-md border border-line bg-black">
				<video
					ref={video}
					muted
					playsInline
					className={cn(
						"size-full -scale-x-100 object-cover",
						state !== "on" && "invisible",
					)}
				/>
				{state !== "on" && (
					<div className="absolute inset-0 flex items-center justify-center p-4 text-center">
						{state === "failed" ? (
							<p className="type-body-sm text-[#FF6B81]">{error}</p>
						) : (
							<Camera className="size-8 text-white/40" aria-hidden />
						)}
					</div>
				)}
			</div>
			{state === "on" ? (
				<Button variant="outline" size="sm" onClick={stop}>
					Turn it off
				</Button>
			) : (
				<Button
					variant="outline"
					size="sm"
					onClick={start}
					disabled={state === "asking"}
				>
					{state === "asking"
						? "Waiting for permission"
						: state === "failed"
							? "Try again"
							: "Test my camera"}
				</Button>
			)}
			{state === "failed" && (
				<p className="type-body-sm text-ink-muted">
					No camera? Every level still works in Check mode, on recorded clips.
				</p>
			)}
		</div>
	);
}

/** Downloads Python and OpenCV now, so the first level opens ready. */
function ToolchainCard({ downloaded }: { downloaded: boolean }) {
	const [status, setStatus] = useState<RuntimeStatus | null>(null);

	const start = async () => {
		const { getRuntime } = await import("#/runtimes/cv/client");
		const runtime = getRuntime();
		const update = () => setStatus({ ...runtime.status });
		runtime.subscribe(update);
		update();
		await runtime.ready().catch(() => {});
	};

	// A returning student's toolchain starts loading (from cache) straight away.
	// biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
	useEffect(() => {
		if (downloaded) void start();
	}, []);

	const percent = status?.total
		? Math.round((status.loaded / status.total) * 100)
		: 0;
	const ready = status?.state === "ready";
	return (
		<div className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-5">
			<div className="flex items-center justify-between gap-2">
				<span className="type-display-sm text-ink">2. Python</span>
				{ready && <Badge variant="cyan">Ready</Badge>}
			</div>
			<p className="type-body-sm text-ink-muted">
				Python, NumPy and OpenCV run in your browser. The first download is{" "}
				{DOWNLOAD_SIZE}; after that it's kept for next time.
			</p>
			<div className="mt-auto flex flex-col gap-2">
				{status?.state === "failed" ? (
					<p className="type-body-sm text-error">
						Couldn't start: {status.error}
					</p>
				) : status && !ready ? (
					<>
						<span className="flex items-center justify-between gap-3 type-label text-cyan-text">
							<span className="flex items-center gap-2">
								<LoaderCircle className="size-4 animate-spin" aria-hidden />
								{status.total ? "Downloading" : "Starting"}
							</span>
							<span className="type-data tabular-nums">
								{percent ? `${percent}%` : ""}
							</span>
						</span>
						<Progress value={percent} />
					</>
				) : ready ? (
					<span className="flex items-center gap-2 type-label text-cyan-text">
						<CircleCheck className="size-4" aria-hidden />
						Python {status?.label ? "and OpenCV " : ""}ready
					</span>
				) : null}
				{(!status || status.state === "failed") && (
					<Button variant="outline" size="sm" onClick={start}>
						<Download />
						{status?.state === "failed"
							? "Try again"
							: `Download (${DOWNLOAD_SIZE.replace("about ", "")})`}
					</Button>
				)}
			</div>
		</div>
	);
}
