import React from "react";
import { Settings } from "../hooks/useSettings";

interface StatusDotProps {
  settings: Settings | null;
}

export const StatusDot: React.FC<StatusDotProps> = ({ settings }) => {
  if (!settings) return null;

  // Determine dot color and animation class based on STT configuration
  let color = "#ff2b2b"; // default: Red (Muted / Off)
  let tooltip = "Muted";
  let pulseClass = "";

  if (settings.mute) {
    color = "#ff2b2b";
    tooltip = "Muted";
  } else if (settings.sttMode === "Always Listening") {
    color = "#00ff41"; // Green
    tooltip = "Always Listening (VAD)";
    pulseClass = "dot-pulse-green";
  } else if (settings.sttMode === "Push to Talk") {
    color = "#ffb000"; // Amber
    tooltip = "Push to Talk (Right Ctrl)";
    pulseClass = "dot-pulse-amber"; // soft glow
  } else {
    color = "#ff2b2b"; // Red (Off)
    tooltip = "STT Off";
  }

  return (
    <div
      title={tooltip}
      className={`status-dot ${pulseClass}`}
      style={{
        position: "absolute",
        top: "22px",
        right: "26px",
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `0 0 8px ${color}`,
        transition: "background-color 0.3s ease, box-shadow 0.3s ease",
        zIndex: 5,
      }}
    />
  );
};
