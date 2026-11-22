import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { LevelBrief } from "#/components/play/LevelBrief";
import { LevelRail } from "#/components/play/LevelRail";
import { PlayScreen } from "#/components/play/PlayScreen";
import { SiteHeader } from "#/components/site/SiteHeader";
import { Button } from "#/components/ui/button";
import { getLevel, LEVELS, type Level } from "#/levels";
import { storage, useStored } from "#/lib/storage";

export const Route = createFileRoute("/level/$levelId")({
	// Monaco, Pyodide and the camera only run in the browser.
	ssr: false,
	loader: ({ params }) => {
		const level = getLevel(params.levelId);
		if (!level) throw notFound();
		return { levelId: level.id };
	},
	head: ({ params }) => {
		const level = getLevel(params.levelId);
		return {
			meta: [
				{
					title: level
						? `${level.number}. ${level.title} · Learn CV`
						: "Learn CV",
				},
			],
		};
	},
	component: LevelPage,
	notFoundComponent: () => (
		<div className="flex min-h-screen flex-col">
			<SiteHeader />
			<main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-16">
				<h1 className="type-display-sm">No such level</h1>
				<Link to="/" className="text-link underline-offset-4 hover:underline">
					Back to the start
				</Link>
			</main>
		</div>
	),
});

function LevelPage() {
	const { levelId } = Route.useLoaderData();
	const level = getLevel(levelId) as Level;
	const instructor = useStored(storage.isInstructor, false);
	const progress = useStored(storage.getProgress, {});
	const skipped = useStored(storage.getSkipped, []);

	const isUnlocked = useCallback(
		(l: Level) =>
			instructor ||
			l.number === 1 ||
			Boolean(progress[l.number - 1]) ||
			skipped.includes(l.number),
		[instructor, progress, skipped],
	);
	const next = LEVELS[level.number];
	const previous = LEVELS[level.number - 2];
	// Only offered when this level builds on the last one's code.
	const previousCode =
		level.continues && previous ? storage.getPassedCode(previous.number) : null;

	const step = useStored(() => storage.getStep(level.number), 0);
	const hintsShown = useStored(() => storage.getHints(level.number), 0);
	const [failedChecks, setFailedChecks] = useState(0);
	const [replacement, setReplacement] = useState<{
		code: string;
		n: number;
	} | null>(null);
	const showAnswer =
		instructor || (hintsShown >= level.hints.length && failedChecks >= 2);

	return (
		<div className="flex min-h-screen flex-col">
			<SiteHeader>
				<LevelRail
					levels={LEVELS}
					currentId={level.id}
					passed={progress}
					isUnlocked={isUnlocked}
				/>
			</SiteHeader>

			{!isUnlocked(level) ? (
				<main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16">
					<h1 className="type-display-sm uppercase">Not yet</h1>
					<p className="type-body text-ink-muted">
						{level.continues
							? `This level builds on level ${level.number - 1}. Pass that first, or open this one anyway: its starter code already has level ${level.number - 1}'s answer in it.`
							: `Level ${level.number - 1} comes first. Pass it, or open this one anyway: it starts from fresh code.`}
					</p>
					<div className="flex flex-wrap gap-3">
						<Button asChild variant="accent">
							<Link
								to="/level/$levelId"
								params={{ levelId: previous?.id ?? LEVELS[0].id }}
							>
								Go to level {previous?.number}
							</Link>
						</Button>
						<Button
							variant="outline"
							onClick={() => storage.skipTo(level.number)}
						>
							Open it anyway
						</Button>
					</div>
				</main>
			) : (
				<PlayScreen
					key={level.id}
					storageKey={String(level.number)}
					path={`/level/${level.id}`}
					starter={level.starter}
					level={level}
					next={next}
					previousCode={previousCode}
					previousNumber={previous?.number}
					onPassed={(code) => {
						storage.markPassed(level.number, code);
						storage.setStep(level.number, level.steps.length);
					}}
					onFailedCheck={() => setFailedChecks((n) => n + 1)}
					replacement={replacement}
					brief={
						<LevelBrief
							level={level}
							step={step}
							onStep={(s) => storage.setStep(level.number, s)}
							hintsShown={hintsShown}
							onShowHint={() => storage.setHints(level.number, hintsShown + 1)}
							showAnswer={showAnswer}
							onUseAnswer={() =>
								setReplacement((r) => ({
									code: level.solution,
									n: (r?.n ?? 0) + 1,
								}))
							}
							instructor={instructor}
						/>
					}
				/>
			)}
		</div>
	);
}
