/**
 * Responsive screenshots for visual review against the approved references.
 *   node scripts/screenshot.mjs [baseUrl]   (default http://localhost:3000)
 * Output: docs/screenshots/<page>-<width>.png
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3000";
const pages = [["home", "/"], ["gallery", "/gallery"], ["reviews", "/reviews"], ["rooms", "/rooms/executive-room"], ["book", "/book"]];
const widths = [360, 768, 1024, 1440];
mkdirSync("docs/screenshots", { recursive: true });
const b = await chromium.launch();
for (const w of widths) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  for (const [name, path] of pages) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
    await p.waitForLoadState("networkidle");
    await p.screenshot({ path: `docs/screenshots/${name}-${w}.png`, fullPage: true });
  }
  await p.close();
}
await b.close();
console.log("Saved to docs/screenshots/");
