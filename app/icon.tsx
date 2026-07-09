import { ImageResponse } from "next/og";

// Dynamicznie generowany favicon — białe „R" na kafelku w kolorze marki
// (brand-600 = #2563eb), spójne z logo w nagłówku.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563eb",
          borderRadius: 7,
          color: "white",
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        R
      </div>
    ),
    size,
  );
}
