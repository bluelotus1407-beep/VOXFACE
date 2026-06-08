import React, { useState, useEffect, useRef } from "react";
import { useTauriEvents } from "../hooks/useTauriEvents";

interface TextReadoutProps {
  active: boolean;
}

export const TextReadout: React.FC<TextReadoutProps> = ({ active }) => {
  const [displayedText, setDisplayedText] = useState("");
  const currentSentenceRef = useRef("");
  const timerRef = useRef<any>(null);

  // Typewriter animation trigger
  const triggerTypewriter = (text: string) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setDisplayedText("");
    let index = 0;
    
    // Type out characters at a pace of 35ms per character
    timerRef.current = setInterval(() => {
      if (index < text.length) {
        setDisplayedText((prev) => prev + text.charAt(index));
        index++;
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }
    }, 35);
  };

  // Listen for complete sentences from the backend proxy
  useTauriEvents<string>("llm:sentence_complete", (event) => {
    if (active) {
      currentSentenceRef.current = event.payload;
      triggerTypewriter(event.payload);
    }
  });

  // Clear text on TTS done
  useTauriEvents<void>("tts:done", () => {
    setTimeout(() => {
      setDisplayedText("");
      currentSentenceRef.current = "";
    }, 1500); // Keep it visible for 1.5s after finishing speech
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  if (!active || !displayedText) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "6px",
        left: "8px",
        right: "8px",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        color: "inherit",
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "10px",
        lineHeight: "1.2",
        padding: "4px 6px",
        borderRadius: "4px",
        border: "1px solid currentColor",
        textAlign: "left",
        pointerEvents: "none",
        zIndex: 10,
        textShadow: "0 0 4px currentColor",
        whiteSpace: "normal",
        wordBreak: "break-word",
        maxHeight: "45px",
        overflow: "hidden",
      }}
    >
      <span style={{ marginRight: "4px" }}>&gt;</span>
      {displayedText}
      <span className="terminal-cursor">█</span>
    </div>
  );
};
