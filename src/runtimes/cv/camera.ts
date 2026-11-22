import { CTRL, FRAME_BYTES, FRAME_H, FRAME_W } from "./shared";

/** Plain-English reasons a camera won't start, for the landing page and the console. */
export function describeCameraError(error: unknown): string {
	const name = (error as DOMException)?.name ?? "";
	if (
		typeof navigator !== "undefined" &&
		!navigator.mediaDevices?.getUserMedia
	) {
		return isSecureContext
			? "This browser doesn't let pages use the camera."
			: "The camera only works over HTTPS (or on localhost).";
	}
	switch (name) {
		case "NotAllowedError":
		case "PermissionDeniedError":
			return "Camera access is blocked for this site. Click the camera icon in the address bar, allow it, then try again.";
		case "NotFoundError":
		case "DevicesNotFoundError":
			return "No camera found. Plug one in, or use Check mode, which runs on recorded clips.";
		case "NotReadableError":
		case "TrackStartError":
		case "AbortError":
			return "The camera is in use by another app (Zoom, Teams, FaceTime, another tab). Close it and try again.";
		case "OverconstrainedError":
			return "The camera doesn't support the resolution we asked for.";
		case "SecurityError":
			return "The browser blocked the camera on this page.";
		default:
			return `The camera didn't start: ${String((error as Error)?.message ?? error)}`;
	}
}

export async function openCameraStream(): Promise<MediaStream> {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw Object.assign(new Error("no getUserMedia"), { name: "Unsupported" });
	}
	return navigator.mediaDevices.getUserMedia({
		audio: false,
		video: {
			width: { ideal: 640 },
			height: { ideal: 480 },
			facingMode: "user",
		},
	});
}

/**
 * The webcam, copied into shared memory at 320x240 for `cap.read()`. Each
 * frame goes into the slot the worker isn't reading, then the sequence number
 * moves and the worker wakes up. Slow scripts skip frames instead of queueing.
 */
export class CameraFeed {
	private stream: MediaStream | null = null;
	private video: HTMLVideoElement | null = null;
	private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
	private ctx:
		| OffscreenCanvasRenderingContext2D
		| CanvasRenderingContext2D
		| null = null;
	private frameRequest = 0;
	private stopped = true;
	private starting: Promise<void> | null = null;

	constructor(
		private readonly ctrl: Int32Array,
		private readonly frames: Uint8Array,
		private readonly onError: (message: string) => void,
	) {}

	get running() {
		return !this.stopped;
	}

	start(): Promise<void> {
		if (!this.stopped) {
			Atomics.store(this.ctrl, CTRL.CAMERA, 1);
			Atomics.notify(this.ctrl, CTRL.CAMERA);
			return Promise.resolve();
		}
		this.starting ??= (async () => {
			try {
				this.stream = await openCameraStream();
				const video = document.createElement("video");
				video.muted = true;
				video.playsInline = true;
				video.srcObject = this.stream;
				await video.play();
				this.video = video;
				this.canvas =
					typeof OffscreenCanvas !== "undefined"
						? new OffscreenCanvas(FRAME_W, FRAME_H)
						: Object.assign(document.createElement("canvas"), {
								width: FRAME_W,
								height: FRAME_H,
							});
				this.ctx = this.canvas.getContext("2d", {
					willReadFrequently: true,
				}) as CanvasRenderingContext2D;
				this.stopped = false;
				this.pump();
			} catch (error) {
				this.stop();
				this.onError(describeCameraError(error));
				Atomics.store(this.ctrl, CTRL.CAMERA, 2);
				Atomics.notify(this.ctrl, CTRL.CAMERA);
			} finally {
				this.starting = null;
			}
		})();
		return this.starting;
	}

	private pump = () => {
		const video = this.video;
		if (this.stopped || !video) return;
		if (video.readyState >= 2 && this.ctx) this.capture(video);
		const withCallback = video as HTMLVideoElement & {
			requestVideoFrameCallback?: (cb: () => void) => number;
		};
		if (withCallback.requestVideoFrameCallback) {
			this.frameRequest = withCallback.requestVideoFrameCallback(this.pump);
		} else {
			this.frameRequest = requestAnimationFrame(this.pump);
		}
	};

	private capture(video: HTMLVideoElement) {
		const ctx = this.ctx;
		if (!ctx) return;
		// Cover-crop the camera's picture to 4:3, then scale to 320x240.
		const vw = video.videoWidth;
		const vh = video.videoHeight;
		if (!vw || !vh) return;
		const scale = Math.max(FRAME_W / vw, FRAME_H / vh);
		const sw = FRAME_W / scale;
		const sh = FRAME_H / scale;
		ctx.drawImage(
			video,
			(vw - sw) / 2,
			(vh - sh) / 2,
			sw,
			sh,
			0,
			0,
			FRAME_W,
			FRAME_H,
		);
		const pixels = ctx.getImageData(0, 0, FRAME_W, FRAME_H).data;
		const seq = Atomics.load(this.ctrl, CTRL.SEQ) + 1;
		this.frames.set(pixels, (seq % 2) * FRAME_BYTES);
		Atomics.store(this.ctrl, CTRL.SEQ, seq);
		Atomics.notify(this.ctrl, CTRL.SEQ);
		if (Atomics.load(this.ctrl, CTRL.CAMERA) !== 1) {
			Atomics.store(this.ctrl, CTRL.CAMERA, 1);
			Atomics.notify(this.ctrl, CTRL.CAMERA);
		}
	}

	stop() {
		this.stopped = true;
		const video = this.video as
			| (HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void })
			| null;
		if (video?.cancelVideoFrameCallback)
			video.cancelVideoFrameCallback(this.frameRequest);
		else cancelAnimationFrame(this.frameRequest);
		for (const track of this.stream?.getTracks() ?? []) track.stop();
		this.stream = null;
		if (video) video.srcObject = null;
		this.video = null;
		Atomics.store(this.ctrl, CTRL.CAMERA, 2);
		Atomics.notify(this.ctrl, CTRL.CAMERA);
	}
}
