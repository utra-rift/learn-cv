import { RUN_SHEET } from "#/levels/run-sheet";
import { inline } from "#/lib/rich-text";
import { cn } from "#/lib/utils";

/** A level's presenter notes. */
export function NotesList({ notes }: { notes: string[] }) {
	return (
		<ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-sm text-ink marker:text-violet">
			{notes.map((note) => (
				<li key={note.slice(0, 32)}>{inline(note)}</li>
			))}
		</ul>
	);
}

/** The hour, with the current level's row picked out. */
export function RunSheet({ current }: { current?: number }) {
	return (
		<ol className="flex flex-col gap-2">
			{RUN_SHEET.map((row) => (
				<li
					key={row.time}
					aria-current={
						current !== undefined && row.level === current ? "step" : undefined
					}
					className={cn(
						"grid grid-cols-[3.5rem_10rem_1fr] gap-3 rounded-sm max-sm:grid-cols-[3.5rem_1fr]",
						current !== undefined &&
							row.level === current &&
							"-mx-2 bg-violet/15 px-2 py-1",
					)}
				>
					<span className="type-data text-ink">{row.time}</span>
					<span className="type-label text-ink">{row.title}</span>
					<span className="type-body-sm text-ink-muted max-sm:col-start-2">
						{row.note}
					</span>
				</li>
			))}
		</ol>
	);
}
