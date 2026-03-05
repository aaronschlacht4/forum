import React from "react";

interface ColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
}

const colors = [
  { name: "Yellow", color: "rgba(255, 235, 59, 0.50)" },
  { name: "Green", color: "rgba(76, 175, 80, 0.50)" },
  { name: "Blue", color: "rgba(33, 150, 243, 0.50)" },
  { name: "Pink", color: "rgba(233, 30, 99, 0.50)" },
  { name: "Orange", color: "rgba(255, 152, 0, 0.50)" },
];

export default function ColorPicker({ currentColor, onColorChange }: ColorPickerProps) {
  return (
    <div
      className="fixed flex flex-col items-center z-40 transition-all duration-300"
      style={{
        right: "110px",
        top: "50%",
        transform: "translateY(-50%)",
        padding: "13px",
        background: "rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(80px) saturate(200%)",
        WebkitBackdropFilter: "blur(80px) saturate(200%)",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        borderRadius: "22px",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.12), inset 0 2px 0 rgba(255, 255, 255, 0.3)",
        gap: "10px",
      }}
    >
      {colors.map(({ name, color }) => (
        <button
          key={color}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onColorChange(color);
          }}
          style={{
            background: color,
            width: "51px",
            height: "51px",
            borderRadius: "13px",
            border: "1px solid rgba(255,255,255,0.3)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            boxShadow:
              currentColor === color
                ? "0 4px 20px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5), 0 0 20px rgba(255,255,255,0.3), 0 0 0 2px rgba(255,255,255,0.5)"
                : "0 4px 16px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 20px rgba(255, 255, 255, 0.5), 0 0 32px rgba(255, 255, 255, 0.3)",
          }}
          className="transition-all hover:scale-105 cursor-pointer"
          title={name}
          type="button"
        />
      ))}
    </div>
  );
}
