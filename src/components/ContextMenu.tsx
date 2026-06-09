import React from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  onReload: () => void;
  onToggleSettings: () => void;
  onToggleMute: () => void;
  onExit: () => void;
  isMuted: boolean;
  accentColor: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  isOpen,
  onClose,
  onReload,
  onToggleSettings,
  onToggleMute,
  onExit,
  isMuted,
  accentColor,
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Click-away overlay */}
      <div
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 999,
          backgroundColor: "transparent",
        }}
      />
      
      {/* The actual menu */}
      <div
        style={{
          position: "fixed",
          left: `${x}px`,
          top: `${y}px`,
          zIndex: 1000,
          backgroundColor: "#18181b",
          border: `2px solid ${accentColor}`,
          borderRadius: "4px",
          padding: "4px 0",
          minWidth: "160px",
          boxShadow: `0 0 10px ${accentColor}44, 0 10px 15px -3px rgba(0, 0, 0, 0.7)`,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: "11px",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          pointerEvents: "auto",
          WebkitAppRegion: "no-drag",
          appRegion: "no-drag",
        } as React.CSSProperties}
        className="no-drag"
      >
        <div
          onClick={() => {
            onToggleSettings();
            onClose();
          }}
          className="context-menu-item"
          style={{
            padding: "6px 12px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            ["--menu-accent" as any]: accentColor,
          }}
        >
          <span>SYSTEM SETUP</span>
          <span style={{ color: accentColor, fontWeight: "bold" }}>[S]</span>
        </div>
        
        <div
          onClick={() => {
            onToggleMute();
            onClose();
          }}
          className="context-menu-item"
          style={{
            padding: "6px 12px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            ["--menu-accent" as any]: accentColor,
          }}
        >
          <span>{isMuted ? "UNMUTE VOICE" : "MUTE VOICE"}</span>
          <span style={{ color: accentColor, fontWeight: "bold" }}>[M]</span>
        </div>
        
        <div
          onClick={() => {
            onReload();
            onClose();
          }}
          className="context-menu-item"
          style={{
            padding: "6px 12px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            ["--menu-accent" as any]: accentColor,
          }}
        >
          <span>RELOAD WIDGET</span>
          <span style={{ color: accentColor, fontWeight: "bold" }}>[R]</span>
        </div>
        
        <div style={{ height: "1px", backgroundColor: "#3f3f46", margin: "4px 0" }} />
        
        <div
          onClick={() => {
            onExit();
            onClose();
          }}
          className="context-menu-item exit"
          style={{
            padding: "6px 12px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#ef4444",
          }}
        >
          <span>EXIT VOXFACE</span>
          <span style={{ fontWeight: "bold" }}>[X]</span>
        </div>
      </div>
    </>
  );
};
