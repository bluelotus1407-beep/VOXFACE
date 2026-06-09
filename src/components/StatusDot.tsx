import React from "react";
import { Settings } from "../hooks/useSettings";

interface StatusDotProps {
  settings: Settings | null;
  isRecording: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = ({ settings, isRecording }) => {
  if (!settings || settings.sttMode === "Off") return null;

  // Determine dot color and animation class based on recording state
  let color = "#ffb000"; // default orange/amber for "rest of the time"
  let tooltip = `STT Mode: ${settings.sttMode}`;
  let pulseClass = "dot-pulse-amber";

  if (settings.mute) {
    color = "#ffb000";
    tooltip = "Muted";
    pulseClass = "";
  } else if (isRecording) {
    color = "#ff2b2b"; // Red when recording
    tooltip = "Recording / Active";
    pulseClass = "dot-pulse-red";
  } else {
    color = "#ffb000"; // Orange rest of the time
    tooltip = `STT Active: ${settings.sttMode} (Idle)`;
    pulseClass = "dot-pulse-amber";
  }

  return (
    <div
      title={tooltip}
      className={`status-dot ${pulseClass}`}
      style={{
        position: "absolute",
        top: "219px",
        left: "250px",
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `0 0 8px ${color}`,
        transition: "background-color 0.2s ease, box-shadow 0.2s ease",
        zIndex: 5,
      }}
    />
  );
};

