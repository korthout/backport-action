import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const result = await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  minify: true,
  metafile: true,
  banner: {
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
  outfile: "dist/index.js",
});

// Collect licenses from all bundled node_modules packages
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  // Find the last node_modules/ segment to handle nested dependencies
  const lastIdx = input.lastIndexOf("node_modules/");
  if (lastIdx === -1) continue;
  const afterNodeModules = input.slice(lastIdx + "node_modules/".length);
  const match = afterNodeModules.match(/^(@[^/]+\/[^/]+|[^/]+)/);
  if (match) {
    const pkg = match[1];
    const pkgDir = input.slice(0, lastIdx + "node_modules/".length + match[0].length);
    packages.set(pkg, pkgDir);
  }
}

let licenseText = "";
for (const [pkg, pkgDir] of [...packages.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const pkgJson = JSON.parse(
    readFileSync(join(pkgDir, "package.json"), "utf8"),
  );

  const licenseFiles = [
    "LICENSE",
    "license",
    "LICENCE",
    "LICENSE.md",
    "License.md",
    "LICENSE.txt",
    "license.txt",
  ];
  let license = "";
  for (const f of licenseFiles) {
    try {
      license = readFileSync(join(pkgDir, f), "utf8");
      break;
    } catch {
      // try next candidate
    }
  }

  licenseText += `${pkg}\n${pkgJson.license || "Unknown"}\n${license}\n\n`;
}

writeFileSync("dist/licenses.txt", licenseText.trimEnd() + "\n");
console.log(`Collected licenses for ${packages.size} bundled packages`);
