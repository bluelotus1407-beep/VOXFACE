import { useState, useEffect } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useSettings } from "./hooks/useSettings";
import { useWidgetState } from "./hooks/useWidgetState";
import { useWindowDrag } from "./hooks/useWindowDrag";

import { Face } from "./components/Face";
import { CRTFrame } from "./components/CRTFrame";
import { TextReadout } from "./components/TextReadout";
import { AudioRing } from "./components/AudioRing";
import { StatusDot } from "./components/StatusDot";
import { MicButton } from "./components/MicButton";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

function App() {
  const { settings, updateSettings, loading } = useSettings();
  const { state, setState } = useWidgetState(settings);
  const { onDragMouseDown } = useWindowDrag();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Sync OS window size and focusability with widget state and hover transitions
  useEffect(() => {
    const syncWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        
        // 1. Handle window sizing
        if (state === "idle") {
          setIsSettingsOpen(false);
          await appWindow.setMinSize(new LogicalSize(10, 10));
          await appWindow.setSize(new LogicalSize(56, 56));
        } else {
          if (isSettingsOpen) {
            await appWindow.setSize(new LogicalSize(360, 530));
          } else {
            await appWindow.setSize(new LogicalSize(360, 270));
          }
        }

        // 2. Handle window focusability dynamically.
        // The window should only be focusable if settings are open AND the user's cursor is hovering inside the widget.
        // In all other cases (e.g. idle state, closed settings, or when hover leaves), the window is set to non-focusable.
        // This ensures the window manager does not lock input focus or block clicks on background windows.
        const shouldBeFocusable = state !== "idle" && isSettingsOpen && isHovered;
        await appWindow.setFocusable(shouldBeFocusable);
      } catch (err) {
        console.warn("Failed to sync OS window state:", err);
      }
    };
    syncWindow();
  }, [state, isSettingsOpen, isHovered, loading]);

  if (loading) {
    return null; // Don't render until settings load
  }

  const skin = settings?.faceSkin || "Green";
  const glowColorClass = `glow-${skin.toLowerCase()}`;
  const accentColor =
    glowColorClass === "glow-white"
      ? "#ffffff"
      : glowColorClass === "glow-amber"
        ? "#ffb000"
        : glowColorClass === "glow-red-glitch"
          ? "#ff2b2b"
          : "#00ff41";

  // Handle double-click to toggle settings panel
  const handleBezelDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state !== "idle") {
      setIsSettingsOpen((prev) => !prev);
    }
  };

  const expandFromIdle = () => setState("listening");

  const handleCircleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    expandFromIdle();
  };

  // Render idle circular icon state
  if (state === "idle") {
    return (
      <div
        onMouseDown={onDragMouseDown}
        onDoubleClick={handleCircleDoubleClick}
        onMouseEnter={() => {
          setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
        className={`idle-pulse ${glowColorClass}`}
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          overflow: "hidden",
          border: `2px solid currentColor`,
          backgroundColor: "#000000",
          cursor: "grab",
          boxSizing: "border-box",
          opacity: isHovered ? 1.0 : 0.7,
          transform: isHovered ? "scale(1.08)" : "scale(1)",
          transition: "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease, border-color 0.3s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
          boxShadow: isHovered
            ? `0 0 12px currentColor`
            : `0 0 6px currentColor`,
        }}
      >
        <div
          style={{
            width: "88%",
            height: "88%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
          }}
          onClick={expandFromIdle}
          onDoubleClick={handleCircleDoubleClick}
        >
          <Face state={state} settings={settings} />
        </div>
      </div>
    );
  }

  // Render expanded CRT monitor state
  return (
    <div
      className="widget-window"
      onMouseDown={onDragMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: "360px",
        height: isSettingsOpen ? "530px" : "270px",
        backgroundColor: "transparent",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflow: "visible",
        cursor: "grab",
      }}
    >
      {/* Listening status ring around the frame */}
      <AudioRing active={state === "listening"} color={accentColor} />

      {/* SVG bezel container */}
      <div
        onMouseDown={onDragMouseDown}
        style={{
          width: "360px",
          height: "270px",
          position: "relative",
          boxSizing: "border-box",
          pointerEvents: "auto",
        }}
      >
        <CRTFrame onDragMouseDown={onDragMouseDown}>
          {/* Inner screen: double-click opens settings; drag still works via parent */}
          <div
            onMouseDown={onDragMouseDown}
            onDoubleClick={handleBezelDoubleClick}
            style={{
              width: "100%",
              height: "100%",
              cursor: "grab",
            }}
          >
            {/* Main Three.js face canvas */}
            <Face state={state} settings={settings} />
          </div>

          {/* Subtitles text readout */}
          <TextReadout active={state === "speaking"} />
        </CRTFrame>

        {/* Top-right Status LED Dot */}
        <StatusDot settings={settings} />

        {/* Hold-to-talk mic control */}
        <MicButton sttMode={settings?.sttMode ?? "Off"} color={accentColor} />
      </div>

      {/* Settings slide-out panel */}
      <div className="no-drag" style={{ width: "100%" }}>
        <SettingsPanel
          isOpen={isSettingsOpen}
          setIsOpen={setIsSettingsOpen}
          settings={settings}
          updateSettings={updateSettings}
        />
      </div>
    </div>
  );
}

export default App;
