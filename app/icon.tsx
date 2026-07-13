import { ImageResponse } from "next/og";

// Dynamicznie generowany favicon — logo wariant D w małej skali:
// mintowe „R" (#4ade9b) na ciemnozielonym kaflu marki (#123829).
// Przy 32px odznaka ✓ jest nieczytelna, więc zostaje sam znak (por. 3a/favicon).
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
          background: "#123829",
          borderRadius: 9,
          color: "#4ade9b",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          fontFamily: "sans-serif",
        }}
      >
        R
      </div>
    ),
    size,
  );
}
