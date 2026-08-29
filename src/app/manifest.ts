import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Slovíčka – angličtina",
    short_name: "Slovíčka",
    description: "Kartičky na učení anglických slovíček a frází.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f6f9",
    theme_color: "#5b53e0",
    lang: "cs",
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
