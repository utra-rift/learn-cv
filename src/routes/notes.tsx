import { createFileRoute } from "@tanstack/react-router";
import { Presentation } from "lucide-react";
import { useEffect, useRef } from "react";
import { NotesList, RunSheet } from "#/components/site/NotesList";
import { getLevel } from "#/levels";
import { RUN_SHEET } from "#/levels/run-sheet";
import { inline, RichText } from "#/lib/rich-text";
import { storage, useStored } from "#/lib/storage";

/**
 * The presenter notes in a window of their own (opened with "Pop out"). It
 * follows the level open in the main tab, so you can share that tab and keep
 * this one on your own screen.
 */
export const Route = createFileRoute("/notes")({
	ssr: false,
	head: () => ({ meta: [{ title: "Presenter notes · Learn CV" }] }),
	component: NotesWindow,
});

function NotesWindow() {
	const levelId = useStored(storage.getNotesLevel, null);
	const open = useStored(storage.isNotesWindowOpen, false);
	const level = levelId ? getLevel(levelId) : undefined;

	// Tell the main tab the notes are here; say so again when this closes.
	useEffect(() => {
		storage.setNotesWindowOpen(true);
		const closed = () => storage.setNotesWindowOpen(false);
		window.addEventListener("pagehide", closed);
		return () => window.removeEventListener("pagehide", closed);
	}, []);

	// "Bring back" in the main tab closes this window.
	const seenOpen = useRef(false);
	useEffect(() => {
		if (open) seenOpen.current = true;
		else if (seenOpen.current) window.close();
	}, [open]);

	const slot = level && RUN_SHEET.find((row) => row.level === level.number);

	return (
		<main className="flex min-h-screen flex-col gap-5 bg-surface p-5">
			<header className="flex items-center gap-2 type-label text-violet-text">
				<Presentation className="size-4" aria-hidden />
				Presenter notes
			</header>

			{level ? (
				<>
					<section className="flex flex-col gap-1">
						<span className="type-data text-[12px] text-ink-muted">
							Level {String(level.number).padStart(2, "0")} · {level.minutes}{" "}
							min{slot ? ` · starts at ${slot.time}` : ""}
						</span>
						<h1 className="type-display-sm text-ink uppercase">
							{level.title}
						</h1>
					</section>

					{level.presenter.length > 0 && (
						<section className="flex flex-col gap-2 rounded-sm border border-violet/50 bg-violet-soft p-4">
							<NotesList notes={level.presenter} />
						</section>
					)}

					<section className="flex flex-col gap-2">
						<h2 className="type-label text-ink-muted">Steps</h2>
						<ol className="flex flex-col gap-3">
							{level.steps.map((step, i) => (
								<li
									key={step.title}
									className="grid grid-cols-[1.5rem_1fr] gap-2"
								>
									<span className="type-data text-cyan-text">{i + 1}</span>
									<div className="flex flex-col gap-0.5">
										<span className="type-label text-ink">{step.title}</span>
										<span className="type-body-sm text-ink-muted">
											{inline(step.body)}
										</span>
									</div>
								</li>
							))}
						</ol>
					</section>

					<details className="rounded-sm border border-line">
						<summary className="cursor-pointer px-4 py-2 type-label text-ink-muted">
							Answer
						</summary>
						<RichText
							className="px-4 pb-4"
							text={`\`\`\`\n${level.solution}\`\`\``}
						/>
					</details>
				</>
			) : (
				<section className="flex flex-col gap-3">
					<p className="type-body-sm text-ink-muted">
						Open a level in the main tab and its notes show up here.
					</p>
					<RunSheet />
				</section>
			)}

			{level && (
				<section className="flex flex-col gap-2 border-t border-line pt-4">
					<h2 className="type-label text-ink-muted">Run sheet</h2>
					<RunSheet current={level.number} />
				</section>
			)}
		</main>
	);
}
