import { useState, useEffect, useRef } from "react";
import { useTauriEvents } from "./useTauriEvents";
import { Settings } from "./useSettings";

export type WidgetState = "idle" | "listening" | "speaking";

export function useWidgetState(settings: Settings | null) {
  const [state, setState] = useState<WidgetState>("idle");
  const idleTimeoutRef = useRef<any>(null);

  const resetIdleTimeout = () => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    
    // Only transition to idle after 3 seconds if not in always-listening STT mode
    // (In always-listening, we want it to stay in the listening state after speaking completes)
    const isAlwaysListening = settings?.sttMode === "Always Listening";
    
    idleTimeoutRef.current = setTimeout(() => {
      if (isAlwaysListening) {
        setState("listening");
      } else {
        setState("idle");
      }
    }, 3000);
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  const setManualState = (newState: WidgetState) => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    setState(newState);
    if (newState === "idle" || (newState === "listening" && settings?.sttMode !== "Always Listening")) {
      // no timeout reset
    } else if (newState === "listening" && settings?.sttMode === "Always Listening") {
      // stays listening
    }
  };

  return { state, setState: setManualState };
}
