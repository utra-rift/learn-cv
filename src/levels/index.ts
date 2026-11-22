import type {
	ClipLabels,
	ClipRun,
	GrayRecord,
	PickedRecord,
} from "#/runtimes/cv/types";
import {
	dist,
	firstBad,
	frames,
	mask,
	mean,
	objectName,
	pct,
	point,
	px,
	tick,
	trackStats,
} from "./measure";
import { type ClipResult, code, type Level } from "./types";

export type { ClipResult, Level, WrongAnswer } from "./types";

// ------------------------------------------------------------------ code

/** A code snippet kept exactly as written, minus the first newline. */
const block = (strings: TemplateStringsArray, ...values: unknown[]) =>
	String.raw({ raw: strings }, ...values).replace(/^\n/, "");

const SLIDERS = code`
def nothing(value):
    pass


# Six sliders under the mask window set the colour range.
# Hue runs 0-179 in OpenCV; saturation and value run 0-255.
cv2.namedWindow("mask")
cv2.createTrackbar("H min", "mask", 25, 179, nothing)
cv2.createTrackbar("H max", "mask", 45, 179, nothing)
cv2.createTrackbar("S min", "mask", 100, 255, nothing)
cv2.createTrackbar("S max", "mask", 255, 255, nothing)
cv2.createTrackbar("V min", "mask", 80, 255, nothing)
cv2.createTrackbar("V max", "mask", 255, 255, nothing)
`;

const THRESHOLD = block`
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    lower = np.array([
        cv2.getTrackbarPos("H min", "mask"),
        cv2.getTrackbarPos("S min", "mask"),
        cv2.getTrackbarPos("V min", "mask"),
    ])
    upper = np.array([
        cv2.getTrackbarPos("H max", "mask"),
        cv2.getTrackbarPos("S max", "mask"),
        cv2.getTrackbarPos("V max", "mask"),
    ])
    mask = cv2.inRange(hsv, lower, upper)
`;

const END = block`
    cv2.imshow("camera", frame)
    cv2.imshow("mask", mask)
    key = cv2.waitKey(1) & 0xFF
    if key == ord("q") or key == 27:
        break

cap.release()
cv2.destroyAllWindows()
`;

// ------------------------------------------------------------------ intro levels

const CAMERA_TOP = `# Lines that start with # are comments: notes for people. Python skips them.

# "import" loads a library so the script can use it. cv2 is OpenCV, the
# computer vision library: everything in it is written cv2.something.
import cv2

# VideoCapture opens a video source. 0 means "the first camera on this
# computer". (In Check mode, a recorded clip stands in for your camera.)
cap = cv2.VideoCapture(0)

# A camera sends a new picture, called a frame, many times a second. So the
# script loops forever and handles one frame each time round.
# "while True:" repeats the indented lines under it until something says break.
while True:
    # read() waits for the next frame and gives back two things:
    #   ok     True if a frame arrived, False if the camera or clip has stopped
    #   frame  the picture itself
    ok, frame = cap.read()

    # No frame means there's nothing left to show, so leave the loop.
    if not ok:
        break
`;

const CAMERA_BOTTOM = `
    # STEP 4: waitKey(1) gives the windows a moment (1 millisecond) to update,
    # and returns the key that was pressed, or -1 if none was. "& 0xFF" keeps
    # just the key's code. Click a window first so the keys go to the script.
    key = cv2.waitKey(1) & 0xFF

    # ord("q") is the code for the q key, and 27 is the code for Esc.
    # Either one breaks out of the loop.
    if key == ord("q") or key == 27:
        break

# After the loop: let go of the camera and close the windows.
cap.release()
cv2.destroyAllWindows()
`;

const CAMERA_STARTER = `${CAMERA_TOP}
    # STEP 2: show the frame in a window called "camera". imshow(name, image)
    # opens the window the first time, then swaps in the new picture after that.
    # Add this line below: cv2.imshow("camera", frame)

    # STEP 3: a black-and-white copy. cvtColor converts between colour formats.
    # OpenCV keeps colour as BGR (blue, green, red, in that order), so
    # COLOR_BGR2GRAY turns a BGR picture into shades of grey.
    gray = None   # change to: cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    # Then show it in its own window: cv2.imshow("gray", gray)
${CAMERA_BOTTOM}`;

const CAMERA_SOLUTION = `${CAMERA_TOP}
    # Show the frame in a window called "camera". imshow(name, image) opens
    # the window the first time, then swaps in the new picture after that.
    cv2.imshow("camera", frame)

    # A black-and-white copy. OpenCV keeps colour as BGR (blue, green, red),
    # so COLOR_BGR2GRAY turns a BGR picture into shades of grey.
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    cv2.imshow("gray", gray)
${CAMERA_BOTTOM}`;

const PIXELS_TOP = `import cv2
# NumPy is the library for arrays: grids of numbers. "as np" lets us write np.
import numpy as np

cap = cv2.VideoCapture(0)
CYAN = (226, 198, 77)   # a colour, written as blue, green, red, each 0 to 255

while True:
    ok, frame = cap.read()
    if not ok:
        break

    # A frame is a NumPy array: a grid of pixels 240 rows tall and 320 columns
    # wide, with 3 numbers per pixel (blue, green, red). So frame.shape is
    # (240, 320, 3). [:2] keeps the first two numbers: the height and width.
    h, w = frame.shape[:2]

    # The middle of the picture. // divides and rounds down to a whole number,
    # because pixel positions are whole numbers.
    cx, cy = w // 2, h // 2
`;

const PIXELS_BOTTOM = `
    # Turn the numbers into text now, before drawing: drawing changes pixels.
    # f"..." is a format string: Python fills in each {...}. ":.0f" means
    # "no decimal places".
    bgr_text = f"B {pixel[0]}  G {pixel[1]}  R {pixel[2]}"
    hsv_text = f"H {picked[0]:.0f}  S {picked[1]:.0f}  V {picked[2]:.0f}"

    # Draw a cross on the middle, and the numbers in the top-left corner.
    # putText(image, text, where, font, size, colour, thickness)
    cv2.drawMarker(frame, (cx, cy), CYAN, cv2.MARKER_CROSS, 24, 2)
    cv2.putText(frame, bgr_text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, CYAN, 2)
    cv2.putText(frame, hsv_text, (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, CYAN, 2)

    cv2.imshow("camera", frame)
    key = cv2.waitKey(1) & 0xFF
    if key == ord("q") or key == 27:
        break

cap.release()
cv2.destroyAllWindows()
`;

const PIXELS_STARTER = `${PIXELS_TOP}
    # STEP 2: one pixel. NumPy indexes an image as [row, column], which is
    # [y, x]: y counts down from the top, x counts right from the left.
    # frame[0, 0] is the top-left corner. Change it to the middle: frame[cy, cx]
    pixel = frame[0, 0]
    # pixel holds three numbers: blue, green and red.

    # STEP 3: the same spot in HSV: hue (which colour), saturation (how vivid)
    # and value (how bright). First convert the whole frame.
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    # Then cut out a 10 x 10 square. In an index, a:b means "from a up to,
    # but not including, b". This is the top-left square; change it to the
    # middle: hsv[cy - 5:cy + 5, cx - 5:cx + 5]
    square = hsv[0:10, 0:10]
    # The average over the square, one number each for H, S and V. axis=(0, 1)
    # means "average down the rows and across the columns". A square's
    # average is steadier than a single pixel.
    picked = square.mean(axis=(0, 1))
${PIXELS_BOTTOM}`;

const PIXELS_SOLUTION = `${PIXELS_TOP}
    # One pixel. NumPy indexes an image as [row, column], which is [y, x]:
    # y counts down from the top, x counts right from the left.
    pixel = frame[cy, cx]

    # The same spot in HSV: hue (which colour), saturation (how vivid) and
    # value (how bright). Convert the frame, cut out a 10 x 10 square around
    # the middle (a:b means "from a up to, not including, b"), and average it.
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    square = hsv[cy - 5:cy + 5, cx - 5:cx + 5]
    picked = square.mean(axis=(0, 1))
${PIXELS_BOTTOM}`;

const L1_STARTER = `import cv2
import numpy as np

# STEP 1: press Run. You'll see two windows: "camera" and a black "mask".
cap = cv2.VideoCapture(0)


${SLIDERS}
while True:
    ok, frame = cap.read()
    if not ok:
        break

    # STEP 2: turn the BGR frame into HSV, where colour is one number (hue).
    hsv = frame   # change to: cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # STEP 3: read the sliders. The minimums are done; do the maximums
    #         the same way, with "H max", "S max" and "V max".
    lower = np.array([
        cv2.getTrackbarPos("H min", "mask"),
        cv2.getTrackbarPos("S min", "mask"),
        cv2.getTrackbarPos("V min", "mask"),
    ])
    upper = np.array([179, 255, 255])

    # STEP 4: white where the colour is between lower and upper, else black.
    mask = np.zeros(frame.shape[:2], np.uint8)   # change to: cv2.inRange(hsv, lower, upper)

${END}`;

const L1_SOLUTION = `import cv2
import numpy as np

cap = cv2.VideoCapture(0)


${SLIDERS}
while True:
    ok, frame = cap.read()
    if not ok:
        break

${THRESHOLD}
${END}`;

const FIND = block`
    # The mask is a black-and-white picture: white (255) where the colour
    # matched, black (0) everywhere else. Morphology reshapes the white areas
    # with a small square of ones called the kernel, like np.ones((5, 5)):
    #   OPEN  shrinks every white area, then grows it back. Specks smaller
    #         than the kernel vanish and don't come back.
    #   CLOSE grows every white area, then shrinks it back. Gaps and holes
    #         narrower than the kernel fill in, like where a finger crosses.
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    center = None
    if contours:
        biggest = max(contours, key=cv2.contourArea)
        if cv2.contourArea(biggest) > MIN_AREA:
            (x, y), radius = cv2.minEnclosingCircle(biggest)
            center = (x, y)
            cv2.circle(frame, (int(x), int(y)), int(radius), CYAN, 2)
`;

const L2_HEADER = `import cv2
import numpy as np

cap = cv2.VideoCapture(0)
MIN_AREA = 150          # pixels: any blob smaller than this is noise
CYAN = (226, 198, 77)   # BGR


${SLIDERS}`;

const L2_STARTER = `${L2_HEADER}
while True:
    ok, frame = cap.read()
    if not ok:
        break

    # Your level 3 answer: the mask.
${THRESHOLD}
    # The mask is a black-and-white picture: white (255) where the colour
    # matched, black (0) everywhere else. Morphology reshapes the white areas
    # with a small square of ones called the kernel, like np.ones((5, 5)):
    #   OPEN  shrinks every white area, then grows it back. Specks smaller
    #         than the kernel vanish and don't come back.
    #   CLOSE grows every white area, then shrinks it back. Gaps and holes
    #         narrower than the kernel fill in, like where a finger crosses.
    #
    # STEP 2: the OPEN line is done. Add a second line the same way with
    #         cv2.MORPH_CLOSE and a bigger kernel, np.ones((15, 15), np.uint8),
    #         so the gaps where your fingers cross the object fill in.
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

    # STEP 3: outline every white blob.
    contours = []   # change to: contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # STEP 4: the biggest blob is the object, if it's big enough.
    center = None
    if contours:
        biggest = max(contours, key=cv2.contourArea)
        # if cv2.contourArea(biggest) > MIN_AREA:
        #     fit a circle: (x, y), radius = cv2.minEnclosingCircle(biggest)
        #     set center = (x, y)
        #     draw it: cv2.circle(frame, (int(x), int(y)), int(radius), CYAN, 2)

${END}`;

const L2_SOLUTION = `${L2_HEADER}
while True:
    ok, frame = cap.read()
    if not ok:
        break

${THRESHOLD}
${FIND}
${END}`;

const L3_HEADER = `import cv2
import numpy as np

cap = cv2.VideoCapture(0)
MIN_AREA = 150
CYAN = (226, 198, 77)     # the estimate
VIOLET = (255, 97, 123)   # the aim point
LEAD = 0.2                # seconds to aim ahead
dt = 1 / cap.get(cv2.CAP_PROP_FPS)

# The state is [x, y, vx, vy]: position in pixels, velocity in pixels/second.
H = np.array([[1, 0, 0, 0],
              [0, 1, 0, 0]], float)   # we measure position only
Q = np.diag([1.0, 1.0, 400.0, 400.0]) # how much the motion can change per step
R = np.eye(2) * 4.0                   # how noisy a measured centre is

`;

const L3_STARTER = `${L3_HEADER}# STEP 2: the constant-velocity model. Put dt in the top two rows so that
#         x becomes x + vx * dt and y becomes y + vy * dt each step.
F = np.array([[1, 0, 0, 0],
              [0, 1, 0, 0],
              [0, 0, 1, 0],
              [0, 0, 0, 1]], float)

${SLIDERS}
state = None   # [x, y, vx, vy], once the ball has been seen
P = None       # how unsure we are about the state
estimate = None
aim = None
missing = 0

while True:
    ok, frame = cap.read()
    if not ok:
        break

    # Your level 4 answer: center is the measured position, or None.
${THRESHOLD}
${FIND}
    # STEP 3: predict. Every frame, seen or not, move the state one step on.
    if state is not None:
        pass   # state = F @ state
               # P = F @ P @ F.T + Q

    # STEP 4: update. When we can see the ball, pull the state toward it.
    if center is not None:
        z = np.array(center)
        if state is None:          # first sighting: start the filter here
            state = np.array([z[0], z[1], 0.0, 0.0])
            P = np.diag([10.0, 10.0, 1e4, 1e4])
        else:
            pass   # y = z - H @ state                 how far off the prediction was
                   # S = H @ P @ H.T + R               how unsure that difference is
                   # K = P @ H.T @ np.linalg.inv(S)    how much to trust the camera
                   # state = state + K @ y
                   # P = (np.eye(4) - K @ H) @ P
        missing = 0
    else:
        missing += 1
        if missing > 30:    # lost it for a second: start over
            state = None

    if state is not None:
        estimate = (state[0], state[1])
        # STEP 5: aim where it will be: position + velocity * LEAD.
        aim = (state[0], state[1])
        cv2.circle(frame, (int(estimate[0]), int(estimate[1])), 5, CYAN, -1)
        cv2.drawMarker(frame, (int(aim[0]), int(aim[1])), VIOLET, cv2.MARKER_CROSS, 16, 2)
    else:
        estimate = aim = None

${END}`;

const L3_SOLUTION = `${L3_HEADER}F = np.array([[1, 0, dt, 0],
              [0, 1, 0, dt],
              [0, 0, 1, 0],
              [0, 0, 0, 1]], float)

${SLIDERS}
state = None
P = None
estimate = None
aim = None
missing = 0

while True:
    ok, frame = cap.read()
    if not ok:
        break

${THRESHOLD}
${FIND}
    # Predict: where the ball should be now, even if we can't see it.
    if state is not None:
        state = F @ state
        P = F @ P @ F.T + Q

    # Update: pull the prediction toward the measurement.
    if center is not None:
        z = np.array(center)
        if state is None:
            state = np.array([z[0], z[1], 0.0, 0.0])
            P = np.diag([10.0, 10.0, 1e4, 1e4])
        else:
            y = z - H @ state
            S = H @ P @ H.T + R
            K = P @ H.T @ np.linalg.inv(S)
            state = state + K @ y
            P = (np.eye(4) - K @ H) @ P
        missing = 0
    else:
        missing += 1
        if missing > 30:    # lost it for a second: start over
            state = None

    if state is not None:
        estimate = (state[0], state[1])
        aim = (state[0] + state[2] * LEAD, state[1] + state[3] * LEAD)
        cv2.circle(frame, (int(estimate[0]), int(estimate[1])), 5, CYAN, -1)
        cv2.drawMarker(frame, (int(aim[0]), int(aim[1])), VIOLET, cv2.MARKER_CROSS, 16, 2)
    else:
        estimate = aim = None

${END}`;

const L4_HEADER = `import math

import cv2
import numpy as np

cap = cv2.VideoCapture(0)
CYAN = (226, 198, 77)
background = None
fingers = None
hand = None


def angle_at(far, start, end):
    """The angle in degrees at \`far\` between the lines to start and end."""
    a = np.linalg.norm(end - start)
    b = np.linalg.norm(far - start)
    c = np.linalg.norm(end - far)
    cos = (b * b + c * c - a * a) / (2 * b * c + 1e-9)
    return math.degrees(math.acos(np.clip(cos, -1, 1)))

`;

const L4_STARTER = `${L4_HEADER}
while True:
    ok, frame = cap.read()
    if not ok:
        break
    blur = cv2.GaussianBlur(frame, (5, 5), 0)
    fingers = None

    if background is not None:
        # STEP 2: whatever changed since you pressed b is your hand.
        diff = cv2.absdiff(blur, background).max(axis=2)
        hand = np.zeros_like(diff)   # change to: _, hand = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
        hand = cv2.morphologyEx(hand, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

        contours, _ = cv2.findContours(hand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        fingers = 0
        if contours:
            c = max(contours, key=cv2.contourArea)
            if cv2.contourArea(c) > 3000:
                # STEP 3: stretch a rubber band (the hull) around the hand,
                #         then find the dents between band and hand.
                defects = None   # hull = cv2.convexHull(c, returnPoints=False)
                                 # defects = cv2.convexityDefects(c, hull)
                valleys = 0
                if defects is not None:
                    for s, e, f, depth in defects[:, 0]:
                        start, end, far = c[s][0], c[e][0], c[f][0]
                        # STEP 4: count only deep, sharp dents: the valleys between fingers.
                        # if depth / 256 > 20 and angle_at(far, start, end) < 90:
                        #     valleys += 1
                        #     cv2.circle(frame, (int(far[0]), int(far[1])), 4, CYAN, -1)
                if valleys > 0:
                    fingers = valleys   # STEP 5: two fingers have one valley between them
                else:
                    # No valleys: a fist, or one finger. One finger reaches
                    # well above the palm.
                    dist = cv2.distanceTransform(hand, cv2.DIST_L2, 5)
                    _, radius, _, palm = cv2.minMaxLoc(dist)
                    top = c[c[:, :, 1].argmin()][0]
                    fingers = 1 if palm[1] - top[1] > 1.5 * radius else 0
                cv2.drawContours(frame, [cv2.convexHull(c)], -1, CYAN, 1)
        cv2.putText(frame, str(fingers), (12, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, CYAN, 2)

    cv2.imshow("camera", frame)
    if hand is not None:
        cv2.imshow("hand", hand)
    # STEP 1: point the camera at a plain wall, move your hand out of view
    #         and press b. Then hold up your hand.
    key = cv2.waitKey(1) & 0xFF
    if key == ord("b"):
        background = blur.copy()   # b saves the empty background
    if key == ord("q") or key == 27:
        break

cap.release()
cv2.destroyAllWindows()
`;

const L4_SOLUTION = `${L4_HEADER}
while True:
    ok, frame = cap.read()
    if not ok:
        break
    blur = cv2.GaussianBlur(frame, (5, 5), 0)
    fingers = None

    if background is not None:
        # Whatever changed since b is the hand. Compare in colour, not grey:
        # some skin tones are as bright as the wall behind them.
        diff = cv2.absdiff(blur, background).max(axis=2)
        _, hand = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
        hand = cv2.morphologyEx(hand, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        hand = cv2.morphologyEx(hand, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

        contours, _ = cv2.findContours(hand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        fingers = 0
        if contours:
            c = max(contours, key=cv2.contourArea)
            if cv2.contourArea(c) > 3000:
                hull = cv2.convexHull(c, returnPoints=False)
                defects = cv2.convexityDefects(c, hull)
                valleys = 0
                if defects is not None:
                    for s, e, f, depth in defects[:, 0]:
                        start, end, far = c[s][0], c[e][0], c[f][0]
                        if depth / 256 > 20 and angle_at(far, start, end) < 90:
                            valleys += 1
                            cv2.circle(frame, (int(far[0]), int(far[1])), 4, CYAN, -1)
                if valleys > 0:
                    fingers = valleys + 1
                else:
                    # No valleys: a fist, or one finger. One finger reaches
                    # well above the palm.
                    dist = cv2.distanceTransform(hand, cv2.DIST_L2, 5)
                    _, radius, _, palm = cv2.minMaxLoc(dist)
                    top = c[c[:, :, 1].argmin()][0]
                    fingers = 1 if palm[1] - top[1] > 1.5 * radius else 0
                cv2.drawContours(frame, [cv2.convexHull(c)], -1, CYAN, 1)
        cv2.putText(frame, str(fingers), (12, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, CYAN, 2)

    cv2.imshow("camera", frame)
    if hand is not None:
        cv2.imshow("hand", hand)
    key = cv2.waitKey(1) & 0xFF
    if key == ord("b"):
        background = blur.copy()   # b saves the empty background
    if key == ord("q") or key == 27:
        break

cap.release()
cv2.destroyAllWindows()
`;

const ARMOR = `import cv2
import numpy as np

# Armor plates have a light bar down each side. Find the bars, then pair them.
cap = cv2.VideoCapture("armor.mp4")   # try 0 if you have a plate and a camera
CYAN = (226, 198, 77)
VIOLET = (255, 97, 123)

while True:
    ok, frame = cap.read()
    if not ok:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)   # loop the clip
        continue

    # Same pipeline as level 4: threshold, clean, contours.
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    bars_mask = cv2.inRange(hsv, (85, 60, 200), (130, 255, 255))
    bars_mask = cv2.morphologyEx(bars_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(bars_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # A bar is a tall, thin blob. Not a ball: two of them make one target.
    bars = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if cv2.contourArea(c) > 40 and h > 1.5 * w:
            bars.append((x + w / 2, y + h / 2, h))
            cv2.rectangle(frame, (x, y), (x + w, y + h), CYAN, 1)

    # Pair bars of similar height that sit side by side.
    bars.sort()
    for (x1, y1, h1), (x2, y2, h2) in zip(bars, bars[1:]):
        similar = abs(h1 - h2) < 0.3 * max(h1, h2)
        level = abs(y1 - y2) < 0.5 * max(h1, h2)
        apart = 1.0 * h1 < x2 - x1 < 4.0 * h1
        if similar and level and apart:
            plate = (int((x1 + x2) / 2), int((y1 + y2) / 2))
            cv2.drawMarker(frame, plate, VIOLET, cv2.MARKER_CROSS, 18, 2)

    cv2.imshow("camera", frame)
    cv2.imshow("bars", bars_mask)
    key = cv2.waitKey(30) & 0xFF
    if key == ord("q") or key == 27:
        break

cap.release()
cv2.destroyAllWindows()
`;

export const PLAYGROUND_STARTER = `import cv2
import numpy as np

cap = cv2.VideoCapture(0)
# Or a recorded clip: "ball.mp4", "note.mp4", "cup.mp4", "ball-fingers.mp4",
# "note-fingers.mp4", "occlusion.mp4", "throw.mp4", "hand-light.mp4",
# "hand-medium.mp4", "hand-dark.mp4", "armor.mp4"

while True:
    ok, frame = cap.read()
    if not ok:
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 80, 160)

    cv2.imshow("camera", frame)
    cv2.imshow("edges", edges)
    key = cv2.waitKey(1) & 0xFF
    if key == ord("q") or key == 27:
        break

cap.release()
cv2.destroyAllWindows()
`;

// ------------------------------------------------------------------ grading

function missingVariable(name: string, run: ClipRun): string | null {
	const records = run.records.filter((rec) => rec !== null);
	if (!records.length || records.some((rec) => rec?.[name] !== "missing"))
		return null;
	return `\`${name}\` is never set, so there's nothing to check. Keep it at the top level of the script (not inside a function) and set it every frame.`;
}

function measureGray(run: ClipRun, labels: ClipLabels): ClipResult {
	const fail = (summary: string, coach: string): ClipResult => ({
		clip: run.clip,
		passed: false,
		summary: `${run.clip}: ${summary} ${tick(false)}`,
		coach,
	});
	if (run.shown.length === 0) {
		return fail(
			"no windows",
			'Nothing was shown. Add `cv2.imshow("camera", frame)` inside the loop, after the `if not ok: break` lines.',
		);
	}
	const bad = firstBad(run, "gray");
	if (bad) {
		return fail(
			`gray is a ${bad}`,
			`\`gray\` should be an image from \`cv2.cvtColor\`, but it's a ${bad}.`,
		);
	}
	const missing = missingVariable("gray", run);
	if (missing) return fail("no gray", missing);
	const rows = frames(run, labels).map((f) => f.rec.gray as GrayRecord | null);
	const set = rows.filter((r): r is GrayRecord =>
		Boolean(r && typeof r === "object"),
	);
	if (set.length === 0) {
		return fail(
			"gray is None",
			"`gray` is still `None`. Change that line to `gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)`.",
		);
	}
	const right = set.filter((r) => r.ok).length / rows.length;
	if (right >= 0.95 && run.shown.length >= 2) {
		return {
			clip: run.clip,
			passed: true,
			summary: `${run.clip}: gray matches in ${pct(right)} of frames, ${run.shown.length} windows ${tick(true)}`,
		};
	}
	if (right >= 0.95) {
		return fail(
			"one window",
			`Only the "${run.shown[0]}" window was shown. Show both: \`cv2.imshow("camera", frame)\` and \`cv2.imshow("gray", gray)\`.`,
		);
	}
	if (set.some((r) => r.why === "channels")) {
		return fail(
			"gray has 3 channels",
			"`gray` still has three numbers per pixel, so it's a colour picture. Convert it: `cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)`.",
		);
	}
	if (set.some((r) => r.why === "shape")) {
		return fail(
			"gray is the wrong size",
			"`gray` isn't the same size as the frame. Convert the whole frame, without resizing or cropping it.",
		);
	}
	return fail(
		`gray off by ${mean(set.map((r) => r.diff ?? 0)).toFixed(1)}`,
		"`gray` isn't quite OpenCV's greyscale of the frame. Use `cv2.COLOR_BGR2GRAY`: OpenCV frames are BGR, not RGB, and the two weigh red and blue differently.",
	);
}

function measurePicked(run: ClipRun, labels: ClipLabels): ClipResult {
	const fail = (summary: string, coach: string): ClipResult => ({
		clip: run.clip,
		passed: false,
		summary: `${run.clip}: ${summary} ${tick(false)}`,
		coach,
	});
	const bad = firstBad(run, "picked");
	if (bad) {
		return fail(
			`picked is a ${bad}`,
			`\`picked\` should be three numbers (H, S and V), but it's a ${bad}.`,
		);
	}
	const missing = missingVariable("picked", run);
	if (missing) return fail("no picked", missing);
	const rows = frames(run, labels)
		.map((f) => f.rec.picked as PickedRecord | null)
		.filter((r): r is PickedRecord => Boolean(r && typeof r === "object"));
	const right = rows.filter((r) => r.ok).length / (rows.length || 1);
	const summary = `${run.clip}: picked matches the middle in ${pct(right)} of frames`;
	if (right >= 0.85) {
		return {
			clip: run.clip,
			passed: true,
			summary: `${summary} ${tick(true)}`,
		};
	}
	const wrong = rows.filter((r) => !r.ok);
	const swapped = wrong.filter((r) => r.swapped).length / (wrong.length || 1);
	const bgr = wrong.filter((r) => r.bgr).length / (wrong.length || 1);
	const example = wrong[Math.floor(wrong.length / 2)];
	let coach: string;
	if (swapped > 0.5) {
		coach =
			"`picked` comes from the wrong spot: x and y are swapped. NumPy indexes [row, column], which is [y, x], so it's `hsv[cy - 5:cy + 5, cx - 5:cx + 5]`.";
	} else if (bgr > 0.5) {
		coach =
			"`picked` holds blue, green and red, not hue, saturation and value. Take the square from `hsv`, not `frame`.";
	} else {
		const got = example?.got.map((x) => Math.round(x)).join(", ");
		const want = example?.want.map((x) => Math.round(x)).join(", ");
		coach = `\`picked\` doesn't match the middle of the picture: in one frame it's (${got}), and the middle is (${want}). Take the square around the centre, \`hsv[cy - 5:cy + 5, cx - 5:cx + 5]\`, and read it before drawing on the frame.`;
	}
	return {
		clip: run.clip,
		passed: false,
		summary: `${summary} ${tick(false)}`,
		coach,
	};
}

function measureMask(run: ClipRun, labels: ClipLabels): ClipResult {
	const object = objectName(labels);
	const fail = (summary: string, coach: string): ClipResult => ({
		clip: run.clip,
		passed: false,
		summary,
		coach,
	});
	const bad = firstBad(run, "mask");
	if (bad) {
		return fail(
			`${run.clip}: mask is a ${bad}`,
			`\`mask\` should be the black-and-white image \`cv2.inRange\` returns, but it's a ${bad}.`,
		);
	}
	const missing = missingVariable("mask", run);
	if (missing) return fail(`${run.clip}: no mask`, missing);

	const rows = frames(run, labels).filter((f) => f.label.v);
	const masks = rows.map((f) => mask(f.rec.mask)).filter((m) => m !== null);
	const iou = mean(masks.map((m) => m.iou ?? 0));
	const empty = masks.filter((m) => m.fill === 0).length / (masks.length || 1);
	const fill = mean(masks.map((m) => m.fill));
	const cover = mean(masks.map((m) => m.cover ?? 0));
	const passed = iou >= 0.6;
	const summary = `${run.clip}: mask overlaps the ${object} ${pct(iou)} ${tick(passed)}`;
	if (passed) return { clip: run.clip, passed, summary };

	let coach: string;
	if (empty >= 0.5) {
		coach = `The mask is empty in ${pct(empty)} of frames on the ${object} clip: your hue range is probably too narrow, or a minimum is above its maximum.`;
	} else if (fill > 0.2) {
		coach = `The mask covers ${pct(fill)} of the picture on the ${object} clip, so the background is getting through. Raise S min: walls and desks are grey, the ${object} isn't.`;
	} else if (cover < 0.5) {
		coach = `The mask finds only ${pct(cover)} of the ${object}. The darker, shaded side is probably outside the range: lower V min.`;
	} else {
		coach = `The mask overlaps the ${object} ${pct(iou)} on average; it needs 60%. It's picking up things that aren't the ${object}.`;
	}
	return fail(summary, coach);
}

function measureCentre(run: ClipRun, labels: ClipLabels): ClipResult {
	const object = objectName(labels);
	const bad = firstBad(run, "center");
	if (bad) {
		return {
			clip: run.clip,
			passed: false,
			summary: `${run.clip}: center is a ${bad}`,
			coach: `\`center\` should be an (x, y) pair or None, but it's a ${bad}.`,
		};
	}
	const missing = missingVariable("center", run);
	if (missing) {
		return {
			clip: run.clip,
			passed: false,
			summary: `${run.clip}: no center`,
			coach: missing,
		};
	}
	const s = trackStats(run, labels, "center");
	const passed = s.meanError <= 4 && s.missRate <= 0.1 && s.falseRate <= 0.2;
	const summary = `${run.clip}: ${px(s.meanError)} off, missed ${pct(s.missRate)}, ${s.falsePositives} false ${tick(passed)}`;
	if (passed) return { clip: run.clip, passed, summary };
	let coach: string;
	if (s.falseRate > 0.2) {
		coach = `It found a ${object} in ${s.falsePositives} of the ${s.hidden} frames where there isn't one: something small and the same colour is getting through. Ignore blobs under \`MIN_AREA\`.`;
	} else if (s.missRate > 0.1) {
		coach = `No centre in ${pct(s.missRate)} of the frames where the ${object} is in view. Check the mask isn't empty and \`MIN_AREA\` isn't bigger than the ${object}.`;
	} else {
		coach = `The circle is ${px(s.meanError)} off on average once fingers cover the ${object}; it needs to be within 4 px. Close the mask (\`cv2.MORPH_CLOSE\`) with a kernel big enough to join the pieces either side of a finger.`;
	}
	return { clip: run.clip, passed, summary, coach };
}

function measureOcclusion(run: ClipRun, labels: ClipLabels): ClipResult {
	const bad = firstBad(run, "estimate");
	if (bad) {
		return {
			clip: run.clip,
			passed: false,
			summary: `${run.clip}: estimate is a ${bad}`,
			coach: `\`estimate\` should be an (x, y) pair, but it's a ${bad}.`,
		};
	}
	const rows = frames(run, labels);
	const firstSeen = rows.findIndex((f) => point(f.rec.estimate));
	const hidden = rows.filter((f, k) => k > firstSeen && !f.label.v);
	const gone = hidden.filter((f) => !point(f.rec.estimate)).length;
	const hiddenErr = mean(
		hidden.flatMap((f) => {
			const p = point(f.rec.estimate);
			return p ? [dist(p, f.label)] : [];
		}),
	);
	const visibleErr = mean(
		rows
			.filter((f) => f.label.v)
			.flatMap((f) => {
				const p = point(f.rec.estimate);
				return p ? [dist(p, f.label)] : [];
			}),
	);
	const passed =
		firstSeen >= 0 && gone === 0 && hiddenErr <= 15 && visibleErr <= 5;
	const summary =
		gone > 0 || firstSeen < 0
			? `${run.clip}: estimate missing in ${gone} of ${hidden.length} hidden frames ${tick(false)}`
			: `${run.clip}: ${px(hiddenErr)} off while hidden ${tick(passed)}`;
	if (passed) return { clip: run.clip, passed, summary };
	let coach: string;
	if (firstSeen < 0) {
		coach =
			"`estimate` is never set. Set it from the filter's state every frame.";
	} else if (gone > 0) {
		coach = `The estimate disappears for ${gone} frames while the ball is behind the box. Keep predicting (\`state = F @ state\`) on frames with no measurement, and only skip the update.`;
	} else if (hiddenErr > 15) {
		coach = `While the ball is hidden the estimate is ${px(hiddenErr)} off; it needs to be within 15 px. Check \`F\`: position should change by velocity × \`dt\` each step.`;
	} else {
		coach = `The estimate is ${px(visibleErr)} off even while the ball is in view. Check the update step: \`state = state + K @ (z - H @ state)\`.`;
	}
	return { clip: run.clip, passed, summary, coach };
}

function measureLead(run: ClipRun, labels: ClipLabels): ClipResult {
	const bad = firstBad(run, "aim") ?? firstBad(run, "estimate");
	if (bad) {
		return {
			clip: run.clip,
			passed: false,
			summary: `${run.clip}: aim is a ${bad}`,
			coach: `\`aim\` and \`estimate\` should be (x, y) pairs, but one is a ${bad}.`,
		};
	}
	const lead = Math.round((labels.lead ?? 0.2) * labels.fps);
	const rows = frames(run, labels);
	const first = rows.findIndex((f) => point(f.rec.aim));
	const leadErr: number[] = [];
	const noLeadErr: number[] = [];
	const gap: number[] = [];
	for (const [k, f] of rows.entries()) {
		const aim = point(f.rec.aim);
		const est = point(f.rec.estimate);
		const future = labels.frames[f.i + lead];
		// Give the filter a few frames to find the velocity first.
		if (!aim || first < 0 || k - first < 8 || !future?.v) continue;
		leadErr.push(dist(aim, future));
		if (est) {
			noLeadErr.push(dist(est, future));
			gap.push(Math.hypot(aim[0] - est[0], aim[1] - est[1]));
		}
	}
	const err = mean(leadErr);
	const baseline = mean(noLeadErr);
	const passed = leadErr.length > 5 && err <= 24;
	const summary = leadErr.length
		? `${run.clip}: aim ${px(err)} from where the ball is ${(labels.lead ?? 0.2).toFixed(1)} s later ${tick(passed)}`
		: `${run.clip}: no aim point ${tick(false)}`;
	if (passed) return { clip: run.clip, passed, summary };
	let coach: string;
	if (!leadErr.length) {
		coach = "`aim` is never set. Set it from the filter's state every frame.";
	} else if (mean(gap) < 2) {
		coach = `\`aim\` sits on the estimate, so it's ${px(err)} behind a thrown ball. Lead it: \`aim = position + velocity * LEAD\`.`;
	} else if (err > 2 * baseline) {
		coach = `The aim point overshoots: ${px(err)} off, worse than not leading at all (${px(baseline)}). Is velocity in pixels per second? Multiply by \`LEAD\`, which is in seconds.`;
	} else {
		coach = `The aim point is ${px(err)} from where the ball ends up; it needs to be within 24 px. The velocity estimate is probably lagging: check \`Q\` isn't tiny.`;
	}
	return { clip: run.clip, passed, summary, coach };
}

function measureFingers(run: ClipRun, labels: ClipLabels): ClipResult {
	const bad = firstBad(run, "fingers");
	if (bad) {
		return {
			clip: run.clip,
			passed: false,
			summary: `${run.clip}: fingers is a ${bad}`,
			coach: `\`fingers\` should be a whole number, but it's a ${bad}.`,
		};
	}
	const graded = frames(run, labels).filter(
		(f) => typeof f.label.fingers === "number",
	);
	let right = 0;
	let unset = 0;
	const mistakes = new Map<string, number>();
	for (const f of graded) {
		const got = f.rec.fingers;
		if (got === f.label.fingers) right++;
		else if (got === null || got === undefined || got === "missing") unset++;
		else {
			const key = `${f.label.fingers}:${got}`;
			mistakes.set(key, (mistakes.get(key) ?? 0) + 1);
		}
	}
	const accuracy = graded.length ? right / graded.length : 0;
	// Every count has to work, not just most frames.
	const perCount = new Map<number, [number, number]>();
	for (const f of graded) {
		const n = f.label.fingers as number;
		const [ok, all] = perCount.get(n) ?? [0, 0];
		perCount.set(n, [ok + (f.rec.fingers === n ? 1 : 0), all + 1]);
	}
	const weakest = [...perCount.entries()]
		.map(([n, [ok, all]]) => ({ n, rate: ok / all }))
		.sort((a, b) => a.rate - b.rate)[0];
	const passed = accuracy >= 0.85 && (weakest?.rate ?? 0) >= 0.7;
	const summary = `${run.clip}: right in ${pct(accuracy)} of frames ${tick(passed)}`;
	if (passed) return { clip: run.clip, passed, summary };

	const handFill = mean(
		frames(run, labels)
			.filter((f) => typeof f.label.fingers === "number")
			.map((f) => mask(f.rec.hand)?.fill ?? Number.NaN)
			.filter((x) => !Number.isNaN(x)),
	);
	const skin = run.clip.replace("hand-", "");
	let coach: string;
	if (unset > graded.length / 2) {
		coach =
			"`fingers` stays None. It's only set once there's a background: Check presses `b` on frame 4, so save the background when `waitKey` returns `ord(\"b\")`.";
	} else if (handFill < 0.02) {
		coach = `The hand mask is nearly empty on the ${skin} skin clip: that hand is as bright as the wall, so a greyscale difference can't see it. Take the difference in colour, then \`.max(axis=2)\`.`;
	} else {
		const [worst] = [...mistakes.entries()].sort((a, b) => b[1] - a[1]);
		const [want, got] = worst ? worst[0].split(":").map(Number) : [0, 0];
		if (worst && got === want - 1 && want > 1) {
			coach = `It counts ${got} when ${want} fingers are up. ${want} fingers have ${want - 1} valleys between them: fingers = valleys + 1.`;
		} else if (worst && want === 1 && got === 0) {
			coach =
				"It says 0 when one finger is up. With no valleys it's a fist or one finger: check how far the top of the hand reaches above the palm.";
		} else if (worst && got > want) {
			coach = `It counts ${got} when ${want} fingers are up, so it's counting shallow dents too, like the wrist. Only count defects deeper than about 20 px with an angle under 90°.`;
		} else if (worst) {
			coach = `It counts ${got} when ${want} fingers are up, in ${worst[1]} frames on the ${skin} skin clip. Show the hand mask and check the gaps between fingers stay open.`;
		} else {
			coach = `Right in ${pct(accuracy)} of frames; it needs 85%, and at least 70% for each count.`;
		}
	}
	return { clip: run.clip, passed, summary, coach };
}

/** Mistakes that fail a colour level even if the clips pass. */
function colourProblems(source: string, runs: ClipRun[]): string | null {
	if (/COLOR_RGB2HSV/.test(source)) {
		return "`cv2.COLOR_RGB2HSV` treats the frame as RGB, but OpenCV frames are BGR, so red and blue swap and every hue is wrong. Use `cv2.COLOR_BGR2HSV`.";
	}
	for (const run of runs) {
		const hue = run.trackbars.find((t) => t.role?.[0] === "h" && t.max > 179);
		if (hue) {
			return `The "${hue.name}" slider goes up to ${hue.max}, but OpenCV's hue only runs 0 to 179 (degrees halved, to fit a byte). Set its maximum to 179.`;
		}
		const bounds = run.inRange.find(
			(b) => (b[0]?.[0] ?? 0) > 179 || (b[1]?.[0] ?? 0) > 179,
		);
		if (bounds) {
			return `inRange got a hue of ${Math.max(bounds[0][0], bounds[1][0])}, but OpenCV's hue only runs 0 to 179 (degrees halved, to fit a byte).`;
		}
	}
	return null;
}

/** Likely causes of a failing colour level, from the source and the run. */
function colourSmells(
	source: string,
	runs: ClipRun[],
	labels: (clip: string) => ClipLabels,
): string | null {
	if (/inRange\(\s*frame\b/.test(source) && !/COLOR_BGR2HSV/.test(source)) {
		return "`inRange` is getting the BGR frame. Convert it with `cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)` first: in HSV, one colour is one hue however bright the light is.";
	}
	for (const run of runs) {
		if (!run.inRange.length) continue;
		const roles = run.trackbars.filter((t) => t.role).length;
		if (roles < 6) {
			return `Check sets the sliders to each clip's colour, so the script has to read its bounds from six sliders (H, S and V, min and max). Found ${roles}. Keep names like "H min" and "V max".`;
		}
		const hsv = labels(run.clip).hsv;
		const same = (a: number[], b: number[]) =>
			a.every((v, i) => Math.abs(v - b[i]) < 0.5);
		if (
			hsv &&
			!run.inRange.some(([lo, hi]) => same(lo, hsv.lo) && same(hi, hsv.hi))
		) {
			const [lo, hi] = run.inRange[0];
			return `Check set the sliders to the ${objectName(labels(run.clip))}'s colour (${hsv.lo.join(", ")} to ${hsv.hi.join(", ")}), but \`inRange\` got (${lo.join(", ")}) to (${hi.join(", ")}). Read the bounds from the sliders with \`cv2.getTrackbarPos\` every frame.`;
		}
	}
	return null;
}

// ------------------------------------------------------------------ levels

export const LEVELS: Level[] = [
	{
		id: "1-camera-on",
		number: 1,
		title: "Camera on",
		minutes: 4,
		idea: "Every vision program starts the same way: open the camera, then loop forever, reading one picture (a **frame**) and doing something with it. `cv2.imshow` puts a frame in a window, and `cv2.waitKey` gives the window time to draw and tells you which key was pressed.",
		goal: "Show the camera in a window, and a greyscale copy, `gray`, in a second window. Read the comments in the code: they explain every line.",
		steps: [
			{
				title: "Run it",
				body: "Press **Run** (or Ctrl+Enter) and allow the camera. Nothing appears yet: the script reads frames but never shows them. Press **Stop**.",
			},
			{
				title: "Show the frame",
				body: 'Under STEP 2, add `cv2.imshow("camera", frame)`, indented like the lines around it. Run again: that\'s you.',
			},
			{
				title: "Make it grey",
				body: 'Under STEP 3, change `gray = None` to `gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)` and add `cv2.imshow("gray", gray)` below it. Run: two windows.',
				images: [
					{
						src: "/figures/camera-colour.jpg",
						alt: "A frame from the camera: a tennis ball in a room with a desk.",
						caption: 'cv2.imshow("camera", frame)',
					},
					{
						src: "/figures/camera-gray.jpg",
						alt: "The same frame in shades of grey.",
						caption: 'cv2.imshow("gray", gray)',
					},
				],
			},
			{
				title: "Quit with q",
				body: "Click one of the windows, then press **q**. The loop breaks and the script ends, just like on a laptop. STEP 4 in the code is how.",
			},
			{
				title: "Check it",
				body: "Switch to **Check** next to Run and press it. Check runs your script on two recorded clips instead of your camera.",
			},
		],
		presenter: [
			"Read the loop out loud: read a frame, stop if there isn't one, show it, wait a moment for a key. Every level today has this shape.",
			"Point out that this exact file runs on a laptop with `pip install opencv-python`. Nothing here is browser-only.",
			"Mention BGR now: OpenCV stores blue first. It comes back in level 3.",
			"Anyone whose camera won't start can do this level in Check mode.",
		],
		hints: [
			"Python groups lines by their indentation. The new lines go inside the loop, indented by four spaces like `ok, frame = cap.read()`.",
			'```\ncv2.imshow("camera", frame)\ngray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)\ncv2.imshow("gray", gray)\n```',
		],
		why: "Read, process, show, wait for a key: that loop is the skeleton of every vision program, on a laptop or on the robot.",
		clips: ["ball", "cup"],
		watch: { gray: "gray" },
		starter: CAMERA_STARTER,
		solution: CAMERA_SOLUTION,
		wrongAnswers: [
			{
				name: "colour, not grey",
				code: CAMERA_SOLUTION.replace(
					"gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)",
					"gray = frame",
				),
				expect: /three numbers per pixel/,
			},
			{
				name: "RGB instead of BGR",
				code: CAMERA_SOLUTION.replace(
					"gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)",
					"gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)",
				),
				expect: /BGR/,
			},
			{
				name: "no windows",
				code: CAMERA_SOLUTION.replace(
					'    cv2.imshow("camera", frame)\n',
					"",
				).replace('    cv2.imshow("gray", gray)\n', ""),
				expect: /imshow/,
			},
		],
		measure: measureGray,
	},
	{
		id: "2-pixels",
		number: 2,
		title: "Pixels",
		minutes: 6,
		idea: "A frame is a **NumPy array**: a grid of numbers 240 rows tall and 320 columns wide, with three numbers per pixel. You can read any pixel with `frame[y, x]`, cut out a piece with `frame[y1:y2, x1:x2]`, and average it with `.mean()`. You'll build a colour picker that shows the colour under a cross in the middle of the picture.",
		goal: "Set `picked` to the average H, S and V of the 10 × 10 square in the middle of the frame. Then hold your object over the cross and note its **H**: you'll need it in level 3.",
		steps: [
			{
				title: "Run it",
				body: "Press **Run**. A cross sits in the middle, and the numbers in the corner show the colour of the **top-left** corner, not the middle. Let's fix that.",
			},
			{
				title: "One pixel",
				body: "Under STEP 2, change `frame[0, 0]` to `frame[cy, cx]`. Run it: the B, G and R numbers now follow whatever is under the cross. Note it's **[y, x]**: row first.",
				images: [
					{
						src: "/figures/pixels-grid.jpg",
						alt: "A frame with arrows: x runs right from the top-left corner (0, 0) to 319, y runs down to 239. A cross marks the middle, labelled frame[cy, cx].",
						caption: "x counts right, y counts down, from the top-left",
					},
					{
						src: "/figures/pixels-zoom.png",
						alt: "The 10 by 10 square around the middle, blown up so each pixel is a coloured tile, with the centre pixel outlined.",
						caption: "the square around the middle, one tile per pixel",
					},
				],
			},
			{
				title: "A square in HSV",
				body: "Under STEP 3, change `hsv[0:10, 0:10]` to `hsv[cy - 5:cy + 5, cx - 5:cx + 5]`. Run it and hold different colours over the cross: H changes with the colour, V with the light.",
			},
			{
				title: "Find your colour",
				body: "Hold your object over the cross and write down its **H** number. Tilt it toward and away from the light: H barely moves, V does. That's why level 3 uses HSV.",
				images: [
					{
						src: "/figures/hue-scale.png",
						alt: "The OpenCV hue scale from 0 to 179: red at 0, yellow at 30, green at 60, cyan at 90, blue at 120, magenta at 150 and red again at 179.",
						caption: "Hue in OpenCV: the colour wheel, halved to fit 0 to 179",
						wide: true,
					},
				],
			},
			{
				title: "Check it",
				body: "Switch to **Check** and press it. It compares `picked` with the middle of each frame of two recorded clips.",
			},
		],
		presenter: [
			"Draw the frame as a grid on the board: rows down (y), columns across (x), three numbers in each cell. `frame.shape` is (240, 320, 3).",
			"The trap: NumPy is [row, column] = [y, x], but OpenCV drawing functions take (x, y). The coach catches swapped indexes.",
			"Have everyone call out the H of their object. Yellow is about 30, green about 60, blue about 110: hue is halved to fit 0 to 179.",
			"Show V changing as you tilt the object while H stays put. That one observation is the whole reason for HSV in level 3.",
		],
		hints: [
			"`frame[cy, cx]` is one pixel: row `cy`, column `cx`. Slices work the same way with ranges: `hsv[cy - 5:cy + 5, cx - 5:cx + 5]` is rows `cy - 5` to `cy + 4` and the same columns around `cx`.",
			"`picked` has to come from `hsv`, not `frame`: `frame` is blue, green, red. And read the pixels before `drawMarker` and `putText`, which change them.",
		],
		why: "A picture is just an array of numbers. Index it, slice it, average it: every OpenCV function is doing that underneath.",
		clips: ["ball", "cup"],
		watch: { picked: "picked" },
		starter: PIXELS_STARTER,
		solution: PIXELS_SOLUTION,
		wrongAnswers: [
			{
				name: "x and y swapped",
				code: PIXELS_SOLUTION.replace(
					"square = hsv[cy - 5:cy + 5, cx - 5:cx + 5]",
					"square = hsv[cx - 5:cx + 5, cy - 5:cy + 5]",
				),
				expect: /\[y, x\]/,
			},
			{
				name: "BGR, not HSV",
				code: PIXELS_SOLUTION.replace(
					"square = hsv[cy - 5:cy + 5, cx - 5:cx + 5]",
					"square = frame[cy - 5:cy + 5, cx - 5:cx + 5]",
				),
				expect: /not hue/,
			},
		],
		measure: measurePicked,
	},
	{
		id: "3-see-it",
		number: 3,
		title: "See it",
		minutes: 7,
		idea: "A camera gives you blue, green and red per pixel, and all three change when the light does. Convert to **HSV** and colour becomes one number, the hue, so a range of hues picks out your object under any lighting. `cv2.inRange` turns that range into a mask: white where the object is, black everywhere else.",
		goal: "Make `mask` white on your object and black elsewhere. Tune the sliders on your own object in Live, then Check it on three clips.",
		steps: [
			{
				title: "Run it",
				body: "Press **Run** (or Ctrl+Enter) and allow the camera. You'll see a `camera` window and a black `mask` window with six sliders under it. Hold up your object.",
			},
			{
				title: "Convert to HSV",
				body: "Change `hsv = frame` to `hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)`. OpenCV frames are **BGR**, not RGB.",
				images: [
					{
						src: "/figures/hue-scale.png",
						alt: "The OpenCV hue scale from 0 to 179: red at 0, yellow at 30, green at 60, cyan at 90, blue at 120, magenta at 150 and red again at 179.",
						caption: "Hue in OpenCV: the colour wheel, halved to fit 0 to 179",
						wide: true,
					},
				],
			},
			{
				title: "Read the sliders",
				body: '`lower` already reads the three minimums. Make `upper` read `"H max"`, `"S max"` and `"V max"` the same way.',
			},
			{
				title: "Make the mask",
				body: "Change the `mask = ...` line to `mask = cv2.inRange(hsv, lower, upper)` and Run again.",
			},
			{
				title: "Tune it",
				body: "Drag the sliders until your object is white in the `mask` window and everything else is black. Start with **H min** and **H max**: about 8 either side of the H you read in level 2. If the wall or desk behind you (the background your camera sees) also shows up white in the mask, raise **S min** until it turns black: walls and desks are greyish, your object isn't.",
				images: [
					{
						src: "/figures/tune-camera.jpg",
						alt: "A tennis ball in front of a pale yellow wall, above a brown desk.",
						caption: "camera",
					},
					{
						src: "/figures/tune-before.png",
						alt: "The mask with S min at 0: the ball is white, and so are speckled patches across the whole wall.",
						caption: "S min 0: the wall shows up too",
					},
					{
						src: "/figures/tune-after.png",
						alt: "The mask with S min at 110: only the ball is white, with a thin black line where its seam is.",
						caption: "S min 110: just the ball",
					},
				],
			},
			{
				title: "Check it",
				body: "Switch to **Check** next to Run and press Run. It tries your code on a ball, a sticky note and a cup, setting the sliders to each one's colour.",
			},
		],
		presenter: [
			"Show the HSV idea first: hold two objects of the same colour, one in shadow. In BGR their numbers are far apart; in HSV the hue is the same.",
			"Live-code steps 2 to 4 on the projector, then give the room 4 minutes to tune on their own objects.",
			"Common mistakes: COLOR_RGB2HSV (the coach catches it), a hue slider up to 255 (hue stops at 179), and S min too low so the wall shows up.",
			"Anyone without a camera can do the whole level in Check mode.",
		],
		hints: [
			'`hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)`. OpenCV frames are BGR, not RGB.\n\nThen build the bounds from the sliders:\n```\nlower = np.array([cv2.getTrackbarPos("H min", "mask"), ...])\n```',
			"Hue goes around a circle, halved to fit 0 to 179. Yellow is about 30, green about 60, blue about 110. Push S min up to drop grey walls; push V min down to keep the shaded side of the object.",
		],
		why: "You turned a colour into a mask. Every tracker on the robot starts the same way: decide which pixels matter, before deciding where the target is.",
		clips: ["ball", "note", "cup"],
		watch: { mask: "mask" },
		starter: L1_STARTER,
		solution: L1_SOLUTION,
		wrongAnswers: [
			{
				name: "RGB instead of BGR",
				code: L1_SOLUTION.replace("COLOR_BGR2HSV", "COLOR_RGB2HSV"),
				expect: /BGR/,
			},
			{
				name: "hue slider to 255",
				code: L1_SOLUTION.replace(
					'cv2.createTrackbar("H max", "mask", 45, 179, nothing)',
					'cv2.createTrackbar("H max", "mask", 45, 255, nothing)',
				),
				expect: /179/,
			},
			{
				name: "thresholding BGR",
				code: L1_SOLUTION.replace(
					"mask = cv2.inRange(hsv, lower, upper)",
					"mask = cv2.inRange(frame, lower, upper)",
				).replace("    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)\n", ""),
				expect: /HSV/,
			},
			{
				name: "hard-coded bounds",
				code: L1_SOLUTION.replace(
					"mask = cv2.inRange(hsv, lower, upper)",
					"mask = cv2.inRange(hsv, (25, 100, 80), (45, 255, 255))",
				),
				expect: /getTrackbarPos/,
			},
		],
		measure: measureMask,
		problems: colourProblems,
		smell: colourSmells,
	},
	{
		id: "4-find-it",
		number: 4,
		title: "Find it",
		minutes: 9,
		continues: true,
		idea: "A mask has holes, specks and stray blobs. **Morphology** cleans it: opening deletes specks smaller than the kernel, closing fills gaps narrower than it. Then `findContours` outlines each blob, and the biggest one that's big enough is your object.",
		goal: "Set `center` to the object's (x, y) every frame, or `None` when it's not there. Check grades the centre error, including while fingers cover part of the object.",
		steps: [
			{
				title: "Run it",
				body: "Your level 3 mask is already in. Run it and hold your object half-covered by your fingers. Look at the mask: specks, and holes where your fingers are.",
			},
			{
				title: "Clean the mask",
				body: "The mask is black and white: white where the colour matched. **Morphology** reshapes its white areas with a small square, the kernel: OPEN shrinks then regrows them (specks vanish), CLOSE grows then shrinks them (gaps fill in). Below the OPEN line, add `mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))`. Run it: the holes fill in.",
				images: [
					{
						src: "/figures/morph-camera.jpg",
						alt: "Close-up of the tennis ball with a thumb and a finger across it.",
						caption: "camera, close up",
					},
					{
						src: "/figures/morph-raw.png",
						alt: "The raw mask: the ball broken into pieces where the fingers and seam cross it, and a stray speck.",
						caption: "inRange: pieces and specks",
					},
					{
						src: "/figures/morph-open.png",
						alt: "After opening: the speck and the thinnest slivers are gone.",
						caption: "after OPEN: specks gone",
					},
					{
						src: "/figures/morph-close.png",
						alt: "After closing: the pieces have joined into one blob.",
						caption: "after CLOSE: one blob",
					},
				],
			},
			{
				title: "Find the blobs",
				body: "Change `contours = []` to `contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)`.",
			},
			{
				title: "Fit a circle",
				body: "Uncomment the four lines under STEP 4 and fix the indentation, so the circle and `center` are set only when the biggest blob is bigger than `MIN_AREA`.",
				images: [
					{
						src: "/figures/find-contours.jpg",
						alt: "The ball outlined with a cyan circle and labelled 2231 px; a small yellow-green cap on the desk is outlined and labelled 44 px, too small.",
						caption:
							"the biggest blob gets the circle; the cap is under MIN_AREA",
					},
				],
			},
			{
				title: "Check it",
				body: "Switch to **Check** and Run. It grades how far your centre is from the real one, while fingers cover the object and when it leaves the view.",
			},
		],
		presenter: [
			"Draw it on the board: OPEN = shrink then grow (specks vanish), CLOSE = grow then shrink (gaps close). The kernel size is the biggest speck or gap it handles.",
			"Ask the room why we need MIN_AREA: take the object out of view and watch a speck become the 'object' without it.",
			"Common mistakes: three values from findContours (old OpenCV 3 tutorials), and max() of an empty list. The coach explains both.",
		],
		hints: [
			"```\nmask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))\nmask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))\ncontours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)\n```",
			"`biggest = max(contours, key=cv2.contourArea)` fails on an empty list, so check `if contours:` first. Then `(x, y), radius = cv2.minEnclosingCircle(biggest)` if `cv2.contourArea(biggest) > MIN_AREA`.",
		],
		why: "Mask, clean, contour, pick the biggest, reject the small: that's most of a classic detector. The size check is what keeps a stray reflection from becoming a target.",
		clips: ["ball-fingers", "note-fingers"],
		watch: { center: "point" },
		starter: L2_STARTER,
		solution: L2_SOLUTION,
		wrongAnswers: [
			{
				name: "no size check",
				code: L2_SOLUTION.replace(
					"if cv2.contourArea(biggest) > MIN_AREA:",
					"if True:",
				),
				expect: /MIN_AREA/,
			},
			{
				name: "no closing",
				code: L2_SOLUTION.replace(
					"    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))\n",
					"",
				),
				expect: /px off.*MORPH_CLOSE/,
			},
			{
				name: "OpenCV 3 findContours",
				code: L2_SOLUTION.replace(
					"contours, _ = cv2.findContours(",
					"_, contours, _ = cv2.findContours(",
				),
				expect: /two values/,
			},
			{
				name: "max of no contours",
				code: L2_SOLUTION.replace("    if contours:\n", "    if True:\n"),
				expect: /if contours:/,
			},
		],
		measure: measureCentre,
		problems: colourProblems,
		smell: colourSmells,
	},
	{
		id: "5-track-it",
		number: 5,
		title: "Track it",
		minutes: 14,
		continues: true,
		idea: "A detector only knows where the ball is when it can see it. A **Kalman filter** keeps a guess of position and velocity: every frame it predicts where the ball moved, and when there's a measurement it pulls the guess toward it, by how much it trusts each. Hidden behind a box, it keeps predicting. Its velocity also tells you where to aim, since the shot takes time to get there.",
		goal: "Set `estimate` to the filtered position every frame, including while the ball is hidden, and `aim` to where it will be `LEAD` seconds from now.",
		steps: [
			{
				title: "Run it",
				body: "Your level 4 detector is in, with a cyan dot on the measurement. Hide your object behind your hand: the dot stops. That's what we'll fix.",
			},
			{
				title: "Fill in F",
				body: "In `F`, put `dt` in row 1 column 3 and row 2 column 4, so position moves by velocity × `dt` each frame.",
			},
			{
				title: "Predict",
				body: "Under STEP 3, replace `pass` with the two lines in the comment. This runs every frame, even when the ball is hidden.",
			},
			{
				title: "Update",
				body: "Under STEP 4, replace `pass` with the five lines in the comment. Run it and hide your object again: the dot keeps going.",
				images: [
					{
						src: "/figures/track-hidden.jpg",
						alt: "A ball's path ends at a cardboard box; cyan dots keep going across the box to the estimate, with no measurements there.",
						caption: "hidden behind the box, the estimate keeps going",
					},
				],
			},
			{
				title: "Lead the target",
				body: "Under STEP 5, make `aim = (state[0] + state[2] * LEAD, state[1] + state[3] * LEAD)`. Move your object and watch the violet cross run ahead.",
				images: [
					{
						src: "/figures/track-lead.jpg",
						alt: "A thrown ball with a cyan dot on it, a violet aim cross ahead of it, and a dashed circle where the ball is 0.2 seconds later, right by the cross.",
						caption:
							"aim (violet) lands where the ball is 0.2 s later (dashed)",
					},
				],
			},
			{
				title: "Check it",
				body: "Switch to **Check** and Run: a ball rolls behind a box, then a ball is thrown across the room.",
			},
		],
		presenter: [
			"The whole filter in one sentence: guess where it went (predict), then split the difference with what you see (update), weighted by how much you trust each.",
			"Write the two formulas on the board: x̂ = F x̂ (predict) and x̂ = x̂ + K (z − H x̂) (update). K near 1 trusts the camera; K near 0 trusts the model.",
			"Demo: set R huge (np.eye(2) * 1e4) and the dot lags; set it tiny and it jitters. That's the trade-off teams tune on the robot.",
			"Tie the lead to the robot: a projectile takes time to arrive, so aim at p + v × t_lead. On the robot t_lead comes from the distance and the shot speed.",
			"This is the longest level. If the room is behind at 12 minutes, walk through steps 3 and 4 on the projector together.",
		],
		hints: [
			"The constant-velocity model: position moves by velocity × dt.\n```\nF = np.array([[1, 0, dt, 0],\n              [0, 1, 0, dt],\n              [0, 0, 1, 0],\n              [0, 0, 0, 1]], float)\n```\nPredict every frame. Update only when `center` isn't None.",
			"Start the filter the first time you see the ball: `state = np.array([x, y, 0, 0])` and a big `P` for the unknown velocity, like `np.diag([10, 10, 1e4, 1e4])`. Then `aim = (state[0] + state[2] * LEAD, state[1] + state[3] * LEAD)`.",
		],
		why: "Predict, then correct by how much you trust the sensor: that's the Kalman filter. The same state that rides through occlusions gives the lead for auto-aim.",
		clips: ["occlusion", "throw"],
		watch: { estimate: "point", aim: "point" },
		starter: L3_STARTER,
		solution: L3_SOLUTION,
		wrongAnswers: [
			{
				name: "no lead",
				code: L3_SOLUTION.replace(
					"aim = (state[0] + state[2] * LEAD, state[1] + state[3] * LEAD)",
					"aim = (state[0], state[1])",
				),
				expect: /Lead it/,
			},
			{
				name: "stops predicting when hidden",
				code: L3_SOLUTION.replace(
					"    if state is not None:\n        state = F @ state",
					"    if state is not None and center is not None:\n        state = F @ state",
				).replace(
					"    if state is not None:\n        estimate = (state[0], state[1])",
					"    if state is not None and center is not None:\n        estimate = (state[0], state[1])",
				),
				expect: /Keep predicting/,
			},
			{
				name: "lead in frames, not seconds",
				code: L3_SOLUTION.replace(
					"aim = (state[0] + state[2] * LEAD, state[1] + state[3] * LEAD)",
					"aim = (state[0] + state[2] * 6, state[1] + state[3] * 6)",
				),
				expect: /overshoots/,
			},
		],
		measure: (run, labels) =>
			run.clip === "throw"
				? measureLead(run, labels)
				: measureOcclusion(run, labels),
		problems: colourProblems,
		smell: colourSmells,
	},
	{
		id: "6-count-fingers",
		number: 6,
		title: "Count fingers",
		minutes: 9,
		idea: "No colour this time. Press `b` with the camera on an empty background, and anything that's changed since is your hand, whatever your skin tone. Around the hand's outline, the **convex hull** is a rubber band stretched over it; the **convexity defects** are the deepest points between hull and outline, which are the valleys between raised fingers.",
		goal: "Set `fingers` to how many fingers are up, 0 to 5. Keep the camera still and the wall behind your hand plain. Check presses `b` on its own.",
		steps: [
			{
				title: "Save the background",
				body: "Run it, point the camera at a plain wall, move out of view and press **b** (click a window first so it gets the key). Then hold up your hand.",
			},
			{
				title: "Find the hand",
				body: "Change the `hand = ...` line to `_, hand = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)`. Run it: the `hand` window shows your hand in white.",
				images: [
					{
						src: "/figures/fingers-background.jpg",
						alt: "An empty plain wall: the background saved with b.",
						caption: "saved with b",
					},
					{
						src: "/figures/fingers-camera.jpg",
						alt: "The same wall with a hand held up, four fingers raised.",
						caption: "now",
					},
					{
						src: "/figures/fingers-hand.png",
						alt: "The difference mask: the hand and arm in white, everything else black.",
						caption: "what changed: the hand",
					},
				],
			},
			{
				title: "Hull and defects",
				body: "Replace `defects = None` with the two lines in the comment under STEP 3.",
			},
			{
				title: "Count the valleys",
				body: "Uncomment the three lines under STEP 4. Cyan dots appear between your fingers.",
				images: [
					{
						src: "/figures/fingers-defects.jpg",
						alt: "The hand with a thin cyan hull around it and three cyan dots in the valleys between the four raised fingers, labelled 3 valleys + 1 = 4 fingers.",
						caption: "the hull, and a dot in each deep, sharp valley",
					},
				],
			},
			{
				title: "Valleys to fingers",
				body: "Two fingers have one valley between them, so make it `fingers = valleys + 1`.",
			},
			{
				title: "Check it",
				body: "Switch to **Check** and Run: three hands with different skin tones show 0 to 5 fingers. Check presses b for you.",
			},
		],
		presenter: [
			"Why not threshold skin colour? It depends on the skin tone and the light. Background difference works the same for everyone, as long as the camera doesn't move.",
			"Show the hull as a rubber band around the hand, and a defect as the deepest point of each gap under the band.",
			"If someone's count jumps around: a busy background, a moving camera, or their sleeve. Press b again.",
		],
		hints: [
			"```\ndiff = cv2.absdiff(blur, background).max(axis=2)\n_, hand = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)\n```\nThen open and close it, and take the biggest contour, as in level 4.",
			"`for s, e, f, depth in defects[:, 0]:` gives indexes into the contour: `start, end, far = c[s][0], c[e][0], c[f][0]`. Count it if `depth / 256 > 20` and `angle_at(far, start, end) < 90`. Five fingers have four valleys. For 0 vs 1, compare how far the top of the hand is above the palm.",
		],
		why: "Background difference, a contour, its hull and the defects between them: shape, not colour. The same contour tools measure light bars and plates on the field.",
		clips: ["hand-light", "hand-medium", "hand-dark"],
		watch: { fingers: "int", hand: "fill" },
		starter: L4_STARTER,
		solution: L4_SOLUTION,
		wrongAnswers: [
			{
				name: "greyscale difference",
				code: L4_SOLUTION.replace(
					"diff = cv2.absdiff(blur, background).max(axis=2)",
					"diff = cv2.absdiff(cv2.cvtColor(blur, cv2.COLOR_BGR2GRAY), cv2.cvtColor(background, cv2.COLOR_BGR2GRAY))",
				),
				expect: /colour/,
			},
			{
				name: "valleys, not fingers",
				code: L4_SOLUTION.replace("fingers = valleys + 1", "fingers = valleys"),
				expect: /valleys \+ 1/,
			},
			{
				name: "fist or one finger",
				code: L4_SOLUTION.replace(
					"fingers = 1 if palm[1] - top[1] > 1.5 * radius else 0",
					"fingers = 0",
				),
				expect: /one finger/,
			},
		],
		measure: measureFingers,
	},
	{
		id: "7-armor",
		number: 7,
		title: "Armor plates",
		minutes: 4,
		idea: "On the field, the target isn't a ball. An armor plate is a dark panel with a light bar down each side, so it shows up as **two** tall blobs, not one. The pipeline is the one you built: threshold, clean, contours. Then pair bars of similar height that sit side by side, and the plate is between them. Feed that centre to the level 3 filter and you have auto-aim.",
		goal: "Run it and watch it pair the bars. Nothing to check: this is where the session ends. Teams also train neural networks (YOLO and friends) to find plates; that's a session of its own.",
		steps: [
			{
				title: "Run it",
				body: "Press **Run**. It plays a recorded armor plate and marks each light bar in cyan and the plate in violet.",
				images: [
					{
						src: "/figures/armor-result.jpg",
						alt: "A dark armor plate with a glowing bar on each side; each bar has a cyan box, and a violet cross marks the plate between them.",
						caption: "two light bars, one plate",
					},
				],
			},
			{
				title: "Read it",
				body: "Find the three parts you've built today: the threshold (level 3), the contours (level 4), and the pairing rule that's new.",
			},
			{
				title: "Try it live",
				body: 'Change `"armor.mp4"` to `0` and hold two strips of bright tape on a dark book.',
			},
		],
		presenter: [
			"Close the session: mask (level 3), find (level 4), track and lead (level 5), shape (level 6). Armor detection is the same steps with a pairing rule; feed its centre to the level 3 filter for auto-aim.",
			"One slide on neural networks: YOLO-style detectors learn plates from labelled images instead of rules. Faster to get robust, harder to debug. A follow-up session covers it, with distance estimation and camera calibration.",
			"Remind everyone that /playground stays up after the session.",
		],
		hints: [
			"`cv2.minAreaRect` gives a rotated box for each bar, which handles tilted plates better than `boundingRect`.",
			"Try it on your camera with two strips of bright tape on a dark book.",
		],
		why: "Two light bars, one target: the same contours, with a rule for pairing.",
		clips: [],
		watch: {},
		starter: ARMOR,
		solution: ARMOR,
		wrongAnswers: [],
	},
];

export const CHECKED_LEVELS = LEVELS.filter((level) => level.clips.length > 0);

export function getLevel(id: string): Level | undefined {
	return LEVELS.find((level) => level.id === id);
}
