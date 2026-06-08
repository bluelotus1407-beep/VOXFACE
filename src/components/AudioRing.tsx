import React, { useEffect, useState, useRef } from "react";
import { useTauriEvents } from "../hooks/useTauriEvents";

interface AudioRingProps {
  active: boolean;
  color: string; // matches face skin color
}

export const AudioRing: React.FC<AudioRingProps> = ({ active, color }) => {
  const [amplitude, setAmplitude] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const targetAmpRef = useRef(0);
  const currentAmpRef = useRef(0);

  // Listen to amplitude events (reused for mic amplitude during listening)
  useTauriEvents<number>("tts:amplitude", (event) => {
    if (active) {
      targetAmpRef.current = event.payload;
    }
  });

  // Also listen to a dedicated mic:amplitude event just in case
  useTauriEvents<number>("mic:amplitude", (event) => {
    if (active) {
      targetAmpRef.current = event.payload;
    }
  });

  useEffect(() => {
    if (!active) {
      setAmplitude(0);
      targetAmpRef.current = 0;
      currentAmpRef.current = 0;
      return;
    }

    // Smooth transition interpolation for the visualizer spikes
    const smoothAnimate = () => {
      // Lerp current to target
      currentAmpRef.current += (targetAmpRef.current - currentAmpRef.current) * 0.15;
      
      // Add a tiny idle jitter to keep the ring feeling alive
      const jitter = Math.sin(Date.now() * 0.01) * 0.15 + 0.15;
      const finalVal = Math.max(0, currentAmpRef.current + (targetAmpRef.current === 0 ? jitter : 0));
      
      setAmplitude(finalVal);
      animationFrameRef.current = requestAnimationFrame(smoothAnimate);
    };

    smoothAnimate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [active]);

  if (!active) return null;

  // Render 36 radial lines
  const numSpikes = 36;
  const cx = 200;
  const cy = 155;
  const baseRadius = 185; // fits just outside the 360x270 bezel (180x135 from center)

  const spikes = Array.from({ length: numSpikes }).map((_, i) => {
    const angle = (i * 2 * Math.PI) / numSpikes;
    
    // Scale spike height by amplitude (0 to 7)
    // Max spike length is 35px
    const spikeHeight = 3 + (amplitude / 7) * 28;
    
    // Start coordinates on the base ring
    const x1 = cx + baseRadius * Math.cos(angle);
    const y1 = cy + baseRadius * Math.sin(angle);
    
    // End coordinates extending outwards
    const x2 = cx + (baseRadius + spikeHeight) * Math.cos(angle);
    const y2 = cy + (baseRadius + spikeHeight) * Math.sin(angle);

    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity={0.55 + (amplitude / 7) * 0.45}
        style={{
          filter: "drop-shadow(0 0 3px currentColor)",
          transition: "stroke 0.3s ease",
        }}
      />
    );
  });

  return (
    <svg
      style={{
        position: "absolute",
        top: "-20px",
        left: "-20px",
        width: "400px",
        height: "310px",
        pointerEvents: "none",
        zIndex: -1, // renders behind the bezel
      }}
    >
      {/* Waveform ring spikes */}
      {spikes}
      
      {/* Faint connecting base ring */}
      <circle
        cx={cx}
        cy={cy}
        r={baseRadius}
        fill="none"
        stroke={color}
        strokeWidth="1"
        opacity="0.15"
        strokeDasharray="4,4"
      />
    </svg>
  );
};
