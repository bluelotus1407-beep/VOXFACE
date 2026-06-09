import { useState, useEffect } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useSettings } from "./hooks/useSettings";
import { useWidgetState } from "./hooks/useWidgetState";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useTauriEvents } from "./hooks/useTauriEvents";

import { Face } from "./components/Face";
import { CRTFrame } from "./components/CRTFrame";
import { TextReadout } from "./components/TextReadout";
import { StatusDot } from "./components/StatusDot";
import { MicButton } from "./components/MicButton";
import { SettingsPanel } from "./components/SettingsPanel";
import { ContextMenu } from "./components/ContextMenu";
import "./App.css";
import voxLogo from "./assets/vox.png";

function App() {
  const { settings, updateSettings, loading } = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { state, setState } = useWidgetState(settings, isSettingsOpen);
  const { onDragMouseDown } = useWindowDrag();
  const [isHovered, setIsHovered] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [windowState, setWindowState] = useState<"collapsed" | "expanded">("collapsed");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Keyboard shortcut listener when Context Menu is active
  useEffect(() => {
    if (!contextMenu) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "s") {
        if (state === "idle") {
          setState("listening");
        }
        setIsSettingsOpen((prev) => !prev);
        setContextMenu(null);
      } else if (key === "m") {
        if (settings) {
          updateSettings({ ...settings, mute: !settings.mute });
        }
        setContextMenu(null);
      } else if (key === "r") {
        window.location.reload();
        setContextMenu(null);
      } else if (key === "x") {
        getCurrentWindow().close();
        setContextMenu(null);
      } else if (e.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contextMenu, state, settings, updateSettings]);

  // Delay collapsed window resizing to allow collapse animations to play
  useEffect(() => {
    if (state === "idle") {
      const timer = setTimeout(() => {
        setWindowState("collapsed");
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setWindowState("expanded");
    }
  }, [state]);

  // Sync recording state with settings mode changes
  useEffect(() => {
    setIsRecording(false);
  }, [settings?.sttMode]);

  // Listen to backend start and stop events globally (persists even in collapsed idle state)
  useTauriEvents<void>("stt:listening_start", () => {
    if (settings?.sttMode === "Push to Talk") {
      setIsRecording(true);
    }
  }, [settings?.sttMode]);

  useTauriEvents<void>("stt:speech_detected", () => {
    if (settings?.sttMode === "Always Listening") {
      setIsRecording(true);
    }
  }, [settings?.sttMode]);

  useTauriEvents<void>("stt:listening_stop", () => {
    setIsRecording(false);
  });

  // Sync OS window size and focusability with widget state and hover transitions
  useEffect(() => {
    const syncWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        
        // 1. Handle window sizing
        if (windowState === "collapsed") {
          setIsSettingsOpen(false);
          await appWindow.setMinSize(new LogicalSize(10, 10));
          if (contextMenu !== null) {
            // Expand window to fit context menu next to the mini-icon
            await appWindow.setSize(new LogicalSize(250, 220));
          } else {
            await appWindow.setSize(new LogicalSize(80, 80)); // 80x80 to prevent hover scales/glows from clipping
          }
        } else {
          if (isSettingsOpen) {
            await appWindow.setSize(new LogicalSize(360, 530));
          } else {
            await appWindow.setSize(new LogicalSize(360, 270));
          }
        }

        // 2. Handle window focusability dynamically.
        const shouldBeFocusable = state !== "idle" && isSettingsOpen && isHovered;
        await appWindow.setFocusable(shouldBeFocusable);
      } catch (err) {
        console.warn("Failed to sync OS window state:", err);
      }
    };
    syncWindow();
  }, [windowState, isSettingsOpen, isHovered, loading, contextMenu]);

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Viewport boundaries
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // If collapsed, the window expands to 250x220 to fit the menu
    const effectiveWidth = windowState === "collapsed" ? 250 : windowWidth;
    const effectiveHeight = windowState === "collapsed" ? 220 : windowHeight;
    
    const menuWidth = 160;
    const menuHeight = 135;
    
    let adjustedX = mouseX;
    if (mouseX + menuWidth > effectiveWidth) {
      adjustedX = Math.max(0, effectiveWidth - menuWidth - 8);
    }
    
    let adjustedY = mouseY;
    if (mouseY + menuHeight > effectiveHeight) {
      adjustedY = Math.max(0, effectiveHeight - menuHeight - 8);
    }
    
    setContextMenu({ x: adjustedX, y: adjustedY });
  };

  // Render idle circular icon state
  if (windowState === "collapsed") {
    return (
      <>
        <div
          style={{
            width: "80px",
            height: "80px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <div
            onMouseDown={onDragMouseDown}
            onDoubleClick={handleCircleDoubleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onContextMenu={handleContextMenu}
            className={`vox-mini-icon ${glowColorClass}`}
            style={{
              color: accentColor,
              pointerEvents: "auto",
            }}
            onClick={expandFromIdle}
            title="VOXFACE Desktop Assistant (Click to expand)"
          >
            <div
              className="vox-logo-mask"
              style={{
                width: "89%",
                height: "89%",
                backgroundColor: "currentColor",
                WebkitMaskImage: `url(${voxLogo})`,
                maskImage: `url(${voxLogo})`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                filter: `drop-shadow(0 0 4px currentColor)`,
              }}
            />
          </div>
        </div>

        <ContextMenu
          x={contextMenu?.x ?? 0}
          y={contextMenu?.y ?? 0}
          isOpen={contextMenu !== null}
          onClose={() => setContextMenu(null)}
          onReload={() => window.location.reload()}
          onToggleSettings={() => {
            setState("listening");
            setIsSettingsOpen(true);
          }}
          onToggleMute={() => {
            if (settings) {
              updateSettings({ ...settings, mute: !settings.mute });
            }
          }}
          onExit={() => getCurrentWindow().close()}
          isMuted={settings?.mute ?? false}
          accentColor={accentColor}
        />
      </>
    );
  }

  const transitionClass = state === "idle" ? "widget-exit" : "widget-enter";

  // Render expanded CRT monitor state
  return (
    <>
      <div
        className={`widget-window ${transitionClass}`}
        onMouseDown={onDragMouseDown}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
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
          <StatusDot settings={settings} isRecording={isRecording} />

          {/* Hold-to-talk mic control */}
          <MicButton sttMode={settings?.sttMode ?? "Off"} color={accentColor} isRecording={isRecording} />
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

      <ContextMenu
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        isOpen={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        onReload={() => window.location.reload()}
        onToggleSettings={() => setIsSettingsOpen((prev) => !prev)}
        onToggleMute={() => {
          if (settings) {
            updateSettings({ ...settings, mute: !settings.mute });
          }
        }}
        onExit={() => getCurrentWindow().close()}
        isMuted={settings?.mute ?? false}
        accentColor={accentColor}
      />
    </>
  );
}

export default App;
