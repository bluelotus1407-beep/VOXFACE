import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface MicButtonProps {
  sttMode: string;
  color: string;
}

export const MicButton: React.FC<MicButtonProps> = ({ sttMode, color }) => {
  const [isRecording, setIsRecording] = useState(false);

  if (sttMode === "Off") {
    return null;
  }

  const start = async () => {
    try {
      await invoke("stt_start_recording");
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stop = async () => {
    try {
      await invoke("stt_stop_recording");
      setIsRecording(false);
    } catch (err) {
      console.error("Failed to stop recording:", err);
    }
  };

  const label =
    sttMode === "Always Listening"
      ? "Listening…"
      : isRecording
        ? "Release to send"
        : "Hold to talk";

  return (
    <button
      type="button"
      data-no-drag
      className="no-drag"
      onMouseDown={(e) => {
        e.stopPropagation();
        if (sttMode === "Push to Talk") void start();
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
        if (sttMode === "Push to Talk") void stop();
      }}
      onMouseLeave={() => {
        if (sttMode === "Push to Talk" && isRecording) void stop();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        if (sttMode === "Push to Talk") void start();
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        if (sttMode === "Push to Talk") void stop();
      }}
      title={sttMode === "Push to Talk" ? "Hold to speak, release to send" : "Always listening — just speak"}
      style={{
        position: "absolute",
        bottom: "10px",
        right: "10px",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 10px",
        borderRadius: "16px",
        border: `2px solid ${color}`,
        backgroundColor: isRecording ? "rgba(255, 43, 43, 0.25)" : "rgba(0, 0, 0, 0.75)",
        color,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "10px",
        fontWeight: "bold",
        cursor: sttMode === "Push to Talk" ? "pointer" : "default",
        boxShadow: isRecording ? `0 0 12px ${color}` : `0 0 6px ${color}55`,
        pointerEvents: "auto",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: isRecording || sttMode === "Always Listening" ? "#ff2b2b" : color,
          animation: isRecording || sttMode === "Always Listening" ? "pulse-g 1s infinite" : "none",
        }}
      />
      {label}
    </button>
  );
};
