import { createFileRoute } from "@tanstack/react-router";
import { PlayScreen } from "#/components/play/PlayScreen";
import { SiteHeader } from "#/components/site/SiteHeader";
import { PLAYGROUND_STARTER } from "#/levels";
import { inline } from "#/lib/rich-text";

export const Route = createFileRoute("/playground")({
	ssr: false,
	head: () => ({ meta: [{ title: "Playground · Learn CV" }] }),
	component: Playground,
});

const NOTES = [
	"Any OpenCV you like: `cv2.Canny`, `cv2.HoughCircles`, `cv2.goodFeaturesToTrack`, `cv2.calcOpticalFlowFarneback`.",
	'`cv2.VideoCapture(0)` is your camera. A clip name, like `"throw.mp4"`, plays a recorded clip.',
	"`imshow`, `namedWindow`, trackbars and `waitKey` work as on a laptop. Mouse callbacks and `selectROI` don't.",
	"Everything runs in this tab. Camera frames never leave your laptop.",
];

function Playground() {
	return (
		<div className="flex min-h-screen flex-col">
			<SiteHeader />
			<PlayScreen
				storageKey="playground"
				path="/playground"
				starter={PLAYGROUND_STARTER}
				brief={
					<section className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-5">
						<span className="type-label text-cyan-text">Free play</span>
						<h1 className="type-display-sm text-ink uppercase">Playground</h1>
						<ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-sm text-ink-muted marker:text-cyan">
							{NOTES.map((note) => (
								<li key={note}>{inline(note)}</li>
							))}
						</ul>
					</section>
				}
			/>
		</div>
	);
}
