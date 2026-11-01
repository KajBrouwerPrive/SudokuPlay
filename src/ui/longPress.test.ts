import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MOVE_TOLERANCE_PX, LONG_PRESS_MS, LongPressTracker, type PressPoint } from "./longPress";

const touch = (clientX = 100, clientY = 100): PressPoint => ({ pointerType: "touch", clientX, clientY });

describe("LongPressTracker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires after the finger rests long enough, and swallows the click that follows", () => {
    const tracker = new LongPressTracker();
    const onLongPress = vi.fn();
    tracker.down(touch(), onLongPress);
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledOnce();
    expect(tracker.consumeClick()).toBe(true);
    expect(tracker.consumeClick()).toBe(false);
  });

  it("does nothing for a short tap", () => {
    const tracker = new LongPressTracker();
    const onLongPress = vi.fn();
    tracker.down(touch(), onLongPress);
    tracker.cancel();
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(tracker.consumeClick()).toBe(false);
  });

  it("gives up when the finger moves away, but allows a little wobble", () => {
    const tracker = new LongPressTracker();
    const onLongPress = vi.fn();
    tracker.down(touch(100, 100), onLongPress);
    tracker.move(touch(100 + LONG_PRESS_MOVE_TOLERANCE_PX - 1, 100));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledOnce();

    tracker.down(touch(100, 100), onLongPress);
    tracker.move(touch(100, 100 + LONG_PRESS_MOVE_TOLERANCE_PX + 1));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it("leaves the mouse to click and right click", () => {
    const tracker = new LongPressTracker();
    const onLongPress = vi.fn();
    tracker.down({ pointerType: "mouse", clientX: 0, clientY: 0 }, onLongPress);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(tracker.ownsContextMenu()).toBe(false);
  });

  it("owns the context menu after a touch, so Android does not toggle the note twice", () => {
    const tracker = new LongPressTracker();
    tracker.down(touch(), () => {});
    expect(tracker.ownsContextMenu()).toBe(true);
  });

  it("forgets an unused long press on the next touch, so a later tap still counts", () => {
    const tracker = new LongPressTracker();
    tracker.down(touch(), () => {});
    vi.advanceTimersByTime(LONG_PRESS_MS);
    // No click arrived after this long press; the next tap must not be swallowed.
    tracker.down(touch(), () => {});
    tracker.cancel();
    expect(tracker.consumeClick()).toBe(false);
  });
});
