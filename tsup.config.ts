import { defineConfig } from "tsup";

// The reporting itself runs on the server (and needs nothing from React), so it has no directive. The crash screens are browser
// code and Next has to be told so.
export default defineConfig([
  {
    entry: ["src/index.ts", "src/next.ts"],
    format: ["esm"],
    dts: true,
    clean: false,
  },
  {
    entry: ["src/react.tsx"],
    format: ["esm"],
    dts: true,
    clean: false,
    banner: { js: '"use client";' },
    external: ["react"],
  },
]);
