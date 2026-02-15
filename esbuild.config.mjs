import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  minify: true,
  banner: {
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
  outfile: "dist/index.js",
});