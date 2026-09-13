const fs = require("fs");
const path = require("path");

const vercelStatic = path.resolve(process.cwd(), ".vercel/output/static");
const outputPublic = path.resolve(process.cwd(), ".output/public");

if (fs.existsSync(vercelStatic) && fs.existsSync(outputPublic)) {
  const files = fs.readdirSync(outputPublic);
  for (const file of files) {
    if (
      file.startsWith("sw.js") ||
      file.startsWith("workbox-") ||
      file.endsWith(".webmanifest") ||
      file === "offline.html"
    ) {
      const src = path.join(outputPublic, file);
      const dest = path.join(vercelStatic, file);
      try {
        fs.copyFileSync(src, dest);
        console.log(`[pwa] Copied ${file} to .vercel/output/static`);
      } catch (err) {
        console.warn(`[pwa] Failed to copy ${file}:`, err.message);
      }
    }
  }
}
