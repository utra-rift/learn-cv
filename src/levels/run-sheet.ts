/** The presenter's timings for the hour, on the landing page and in the notes window. */
export interface RunSheetRow {
	time: string;
	title: string;
	note: string;
	/** The level this row covers, if any. */
	level?: number;
}

export const RUN_SHEET: RunSheetRow[] = [
	{
		time: "0:00",
		title: "Setup",
		note: "Everyone opens the site, checks the camera and downloads. Hand out tennis balls and sticky notes.",
	},
	{
		time: "0:05",
		title: "Level 1 · Camera on",
		note: "The read-show-wait loop. Read the comments together on the projector.",
		level: 1,
	},
	{
		time: "0:09",
		title: "Level 2 · Pixels",
		note: "Frames are NumPy arrays: [y, x], slices, mean. Everyone finds their object's hue.",
		level: 2,
	},
	{
		time: "0:15",
		title: "Level 3 · See it",
		note: "HSV and inRange. Live-code steps 2 to 4, then let them tune.",
		level: 3,
	},
	{
		time: "0:22",
		title: "Level 4 · Find it",
		note: "Morphology, contours, the size check.",
		level: 4,
	},
	{
		time: "0:31",
		title: "Level 5 · Track it",
		note: "Predict and update. The longest one: go step by step on the projector.",
		level: 5,
	},
	{
		time: "0:45",
		title: "Level 6 · Count fingers",
		note: "Background difference in a box, hull and defects.",
		level: 6,
	},
	{
		time: "0:54",
		title: "Armor plates",
		note: "The closing demo, and what's next. Ends at 0:58.",
		level: 7,
	},
];
