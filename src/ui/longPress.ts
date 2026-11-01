// Long press on touch screens, the phone version of a right click. Kept free of React and the DOM
// (it only needs pointer type and position), so the timing rules are unit-tested.

/** How long a finger must rest on a cell before it counts as a long press. */
export const LONG_PRESS_MS = 450;
/** A finger that moves further than this is scrolling, not pressing. */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const TOUCH_POINTER = "touch";

export interface PressPoint {
  pointerType: string;
  clientX: number;
  clientY: number;
}

export class LongPressTracker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private start: { x: number; y: number } | null = null;
  private fired = false;
  private touch = false;

  constructor(private readonly delayMs: number = LONG_PRESS_MS) {}

  /** Starts timing a touch; mouse and pen are left to their own click and right click. */
  down(point: PressPoint, onLongPress: () => void): void {
    this.cancel();
    this.fired = false;
    this.touch = point.pointerType === TOUCH_POINTER;
    if (!this.touch) return;
    this.start = { x: point.clientX, y: point.clientY };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fired = true;
      onLongPress();
    }, this.delayMs);
  }

  move(point: PressPoint): void {
    if (!this.timer || !this.start) return;
    if (Math.hypot(point.clientX - this.start.x, point.clientY - this.start.y) > LONG_PRESS_MOVE_TOLERANCE_PX) this.cancel();
  }

  /** The finger lifted, left the cell or the browser took over (scrolling). */
  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** True for the click that ends a long press: that click must not also place a digit. */
  consumeClick(): boolean {
    const fired = this.fired;
    this.fired = false;
    return fired;
  }

  /** Android opens a context menu on a long touch; the tracker already handled that press. */
  ownsContextMenu(): boolean {
    return this.touch;
  }
}
