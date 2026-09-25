import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "EchoLeaks",
    short_name: "EchoLeaks",
    description: "Share confidential files securely from your device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fff7e8",
    theme_color: "#ffdc58",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
