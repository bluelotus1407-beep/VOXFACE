import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const INTERACTIVE_SELECTOR =
  ".no-drag, button, input, select, textarea, a, label, [data-no-drag]";

const DRAG_THRESHOLD_PX = 6;

/**
 * Starts a native window drag only after the pointer moves past a small threshold.
 * Calling startDragging() immediately on mousedown blocks click/double-click (e.g.
 * expanding the idle icon or opening settings on the CRT screen).
 */
export function useWindowDrag() {
  const pendingRef = useRef<{
    startX: number;
    startY: number;
    started: boolean;
  } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pending = pendingRef.current;
      if (!pending || pending.started) return;

      // Ensure primary (left) mouse button is still held down (e.buttons === 1).
      // If it is released, abort to prevent a stale startDragging call on X11.
      if (e.buttons !== 1) {
        pendingRef.current = null;
        return;
      }

      const dx = e.clientX - pending.startX;
      const dy = e.clientY - pending.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      pending.started = true;
      void getCurrentWindow().startDragging();
    };

    const clearPending = () => {
      pendingRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", clearPending);
    window.addEventListener("mouseleave", clearPending);
    window.addEventListener("blur", clearPending);
    document.addEventListener("mouseleave", clearPending);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", clearPending);
      window.removeEventListener("mouseleave", clearPending);
      window.removeEventListener("blur", clearPending);
      document.removeEventListener("mouseleave", clearPending);
    };
  }, []);

  const onDragMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) return;

    pendingRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    };
  }, []);

  return { onDragMouseDown };
}
