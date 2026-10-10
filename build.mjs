import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const output = await build({
  absWorkingDir: root,
  entryPoints: ["src/main.tsx"],
  bundle: true,
  write: false,
  outdir: "dist",
  format: "iife",
  minify: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const js = output.outputFiles
  .find((file) => file.path.endsWith(".js"))
  .text.replaceAll("</script", "<\\/script");
const css = await readFile(path.join(root, "src/style.css"), "utf8");
await mkdir(path.join(root, "dist"), { recursive: true });
await writeFile(
  path.join(root, "dist/index.html"),
  `<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>目标 · Being</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`,
);
await copyFile(
  path.join(root, "desktop.plugin.json"),
  path.join(root, "dist/desktop.plugin.json"),
);
console.log("Built goals plugin: " + path.join(root, "dist"));
