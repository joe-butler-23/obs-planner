import esbuild from "esbuild";

const isProd = process.argv.includes("production");
const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "node",
  external: [
    "obsidian",
    "electron",
    "jkanban",
    "dragula",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common"
  ],
  outfile: "main.js",
  sourcemap: isProd ? false : "inline",
  loader: {
    ".ts": "ts",
    ".tsx": "tsx"
  },
  logLevel: "info"
});

if (isProd) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}
