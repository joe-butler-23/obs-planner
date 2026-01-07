import esbuild from "esbuild";
import { readFile } from "node:fs/promises";

const isProd = process.argv.includes("production");
const patchJkanban = {
  name: "patch-jkanban",
  setup(build) {
    build.onLoad({ filter: /node_modules\/jkanban\/jkanban\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      const patched = source.replace(/\}\)\(\)\s*;?\s*$/, "}).call(globalThis);");
      return { contents: patched, loader: "js" };
    });
  }
};

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "node",
  external: [
    "obsidian",
    "electron",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common"
  ],
  outfile: "dist/main.js",
  sourcemap: isProd ? false : "inline",
  plugins: [patchJkanban],
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
