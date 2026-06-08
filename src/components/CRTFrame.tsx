import React from "react";
import crtBg from "../assets/crt.png";

interface CRTFrameProps {
  children: React.ReactNode;
  onDragMouseDown?: (e: React.MouseEvent) => void;
}

export const CRTFrame: React.FC<CRTFrameProps> = ({ children, onDragMouseDown }) => {
  return (
    <div
      style={{
        position: "relative",
        width: "360px",
        height: "270px",
      }}
    >
      {/* Bezel artwork (visual only; drag handled by edge hit-zones below) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: `url(${crtBg})`,
          backgroundSize: "100% 100%",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Main content container */}
      <div
        onMouseDown={onDragMouseDown}
        style={{
          position: "relative",
          width: "360px",
          height: "270px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          boxSizing: "border-box",
          overflow: "visible",
          zIndex: 4,
        }}
      >
        {/* 
          This is the inner screen area of the CRT monitor.
          Positioned absolutely to match the black space inside crt.png.
        */}
        <div
          onMouseDown={onDragMouseDown}
          style={{
            position: "absolute",
            left: "21%",
            top: "15%",
            width: "57.7%",
            height: "60.5%",
            backgroundColor: "#000000",
            borderRadius: "8px",
            overflow: "hidden",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            boxShadow: "inset 0 0 20px rgba(0, 0, 0, 0.9)",
            pointerEvents: "auto",
            cursor: "grab",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
