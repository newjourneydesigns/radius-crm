import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Scorekeeper",
    short_name: "Scorekeeper",
    description:
      "Choose any game. The AI does the rest — scoresheets, rules, and history through plain conversation.",
    start_url: "/",
    display: "standalone",
    background_color: "#0C2B1C",
    theme_color: "#0C2B1C",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
