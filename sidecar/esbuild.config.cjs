const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: "dist/index.cjs",
    format: "cjs",
    external: ["playwright", "pdf-parse", "pdfjs-dist", "mammoth"], // External: native deps and packages with complex bundling needs
    sourcemap: true,
    minify: false,
    treeShaking: true,
  })
  .then(() => {
    console.log("Build complete: dist/index.cjs");
  })
  .catch((error) => {
    console.error("Build failed:", error);
    process.exit(1);
  });
