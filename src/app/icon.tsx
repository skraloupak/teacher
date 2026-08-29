import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

/** Ikona aplikace – kartička s písmenem, generuje se při buildu. */
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
          background: "linear-gradient(135deg, #5b53e0 0%, #8b83ff 100%)",
          borderRadius: 42,
          color: "white",
          fontSize: 110,
          fontWeight: 700,
          letterSpacing: -4,
        }}
      >
        EN
      </div>
    ),
    size,
  );
}
