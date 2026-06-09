import { useState, useEffect, useRef } from "react";
import { useTauriEvents } from "./useTauriEvents";
import { Settings } from "./useSettings";

export type WidgetState = "idle" | "listening" | "speaking";

export function useWidgetState(settings: Settings | null, isSettingsOpen: boolean) {
  const [state, setState] = useState<WidgetState>("idle");
  const idleTimeoutRef = useRef<any>(null);
  const collapseTimeoutRef = useRef<any>(null);

  const resetIdleTimeout = () => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    
    // Transition to listening state after 1.5 seconds (to match subtitles visibility)
    // The 10-second inactivity timer will then handle collapsing to idle/mini-icon.
    idleTimeoutRef.current = setTimeout(() => {
      setState("listening");
    }, 1500);
  };

  // 1. LLM Token event: transition to speaking
  useTauriEvents<string>("llm:token", () => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    setState("speaking");
  }, [settings?.sttMode]);

  // 2. TTS Done event: start 3 second countdown to idle/listening
  useTauriEvents<void>("tts:done", () => {
    resetIdleTimeout();
  }, [settings?.sttMode]);

  // 3. STT Listening/Speech Events: transition to listening
  useTauriEvents<void>("stt:listening_start", () => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    setState("listening");
  });

  useTauriEvents<void>("stt:speech_detected", () => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    setState("listening");
  });

  // 4. Inactivity collapse effect: collapse to idle after 10s of inactivity
  useEffect(() => {
    if (state === "idle" || isSettingsOpen || state === "speaking") {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
      return;
    }

    const resetCollapseTimer = () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
      collapseTimeoutRef.current = setTimeout(() => {
        setState("idle");
      }, 10000);
    };

    // Initialize timer
    resetCollapseTimer();

    const handleActivity = () => {
      resetCollapseTimer();
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);

    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [state, isSettingsOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
    };
  }, []);

  const setManualState = (newState: WidgetState) => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    setState(newState);
  };

  return { state, setState: setManualState };
}
