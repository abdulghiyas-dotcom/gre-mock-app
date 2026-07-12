import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Muted, ETS-like neutral palette for the test surface.
        testbg: "#f4f4f2",
        testink: "#1a1a1a",
        testline: "#c9c9c4",
        testblue: "#1f4e79",
        // Dark chrome for the top/bottom test-navigation bars, matching the
        // real GRE test-day software's black toolbar convention.
        gretop: "#1c1c1c",
      },
    },
  },
  plugins: [],
};

export default config;
