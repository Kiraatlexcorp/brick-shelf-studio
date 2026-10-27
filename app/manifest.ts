import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Brick Shelf",
    short_name: "Brick Shelf",
    description: "Build Lego-style shelf cubes in the browser and export STL or 3MF.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#800020",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
