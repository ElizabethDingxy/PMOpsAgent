import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172126",
        mist: "#eef3f4",
        pine: "#17634f",
        coral: "#d96c4a",
        amber: "#d69a2d",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(23, 33, 38, 0.08)",
        soft: "0 10px 28px rgba(23, 33, 38, 0.06)",
      },
    },
  },
  plugins: [],
}

export default config
