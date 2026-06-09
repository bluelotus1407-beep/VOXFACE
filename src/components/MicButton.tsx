import React from "react";
import { invoke } from "@tauri-apps/api/core";

interface MicButtonProps {
  sttMode: string;
  color: string;
  isRecording: boolean;
}

export const MicButton: React.FC<MicButtonProps> = ({ sttMode, color, isRecording }) => {
  if (sttMode === "Off") {
    return null;
  }

  const start = async () => {
    try {
      await invoke("stt_start_recording");
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stop = async () => {
    try {
      await invoke("stt_stop_recording");
    } catch (err) {
      console.error("Failed to stop recording:", err);
    }
  };


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
        top: "215px",
        left: "262px",
        zIndex: 20,
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        padding: 0,
        border: `1px solid ${color}`,
        backgroundColor: isRecording ? "#ff2b2b" : "rgba(0, 0, 0, 0.5)",
        cursor: sttMode === "Push to Talk" ? "pointer" : "default",
        boxShadow: isRecording
          ? `0 0 8px #ff2b2b`
          : sttMode === "Always Listening"
            ? `0 0 4px ${color}`
            : "none",
        pointerEvents: "auto",
        transition: "background-color 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease",
      }}
    />
  );
};
