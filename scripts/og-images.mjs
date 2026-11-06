// Renders a 1200×630 link-preview card for each post in writing/ to images/og/<file name>.png,
// using the site's own fonts and colours. Run it after adding a post or changing a title:
//
//   npm run og            # cards for posts that don't have one yet
//   npm run og -- --all   # redraw every card
//
// It drives an installed Chrome or Edge through playwright-core (no browser download).
// Set CHROME_PATH to use a specific browser binary.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(import.meta.dirname, "..");
const outDir = join(root, "images", "og");
const redrawAll = process.argv.includes("--all");

// Front matter values on one line, optionally quoted. Posts here don't use multi-line values.
function frontMatter(file) {
	const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
	const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	const data = {};
	for (const line of block.split("\n")) {
		const m = line.match(/^(\w+):\s*(.*)$/);
		if (m) data[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
	}
	return data;
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function card({ title, description }) {
	const font = (name) => pathToFileURL(join(root, "fonts", name)).href;
	return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Archivo; src: url("${font("archivo-var.woff2")}"); font-weight: 400 800; font-stretch: 100% 125%; }
@font-face { font-family: Newsreader; src: url("${font("newsreader-regular.woff2")}"); }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; background: #0d1311; color: #e5ece7; }
.card { position: relative; display: flex; flex-direction: column; width: 1200px; height: 630px; padding: 72px 88px 64px; }
.card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 12px; background: #f2c14e; }
.kicker { font: 600 26px Archivo, sans-serif; color: #f2c14e; letter-spacing: 0.01em; }
.title { margin-top: 28px; font: 800 72px/1.04 Archivo, sans-serif; font-stretch: 112%; letter-spacing: -0.025em; }
.desc { margin-top: 28px; font: 400 30px/1.4 Newsreader, serif; color: #adb9b2; }
.foot { margin-top: auto; display: flex; align-items: center; gap: 16px; font: 600 26px Archivo, sans-serif; color: #e5ece7; }
.foot span { color: #84928a; font-weight: 500; }
</style></head><body><div class="card">
<p class="kicker">Writing</p>
<h1 class="title">${escapeHtml(title)}</h1>
${description ? `<p class="desc">${escapeHtml(description)}</p>` : ""}
<p class="foot">Jagrit Vats <span>jagritvats.com</span></p>
</div></body></html>`;
}

// Shrink the title, then trim the description, until the card fits without overlap.
async function fit(page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		const cardEl = document.querySelector(".card");
		const title = document.querySelector(".title");
		const desc = document.querySelector(".desc");
		const overflows = () => cardEl.scrollHeight > cardEl.clientHeight;
		let size = 72;
		while (overflows() && size > 50) title.style.fontSize = `${(size -= 2)}px`;
		if (desc) {
			const words = desc.textContent.split(" ");
			while (overflows() && words.length > 8) {
				words.pop();
				desc.textContent = `${words.join(" ").replace(/[,.;:]$/, "")}…`;
			}
			if (overflows()) desc.remove();
		}
	});
}

async function launch() {
	const tries = [
		process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH },
		{ channel: "chrome" },
		{ channel: "msedge" },
	].filter(Boolean);
	for (const options of tries) {
		try {
			return await chromium.launch(options);
		} catch {}
	}
	throw new Error("No Chrome or Edge found. Install one, or set CHROME_PATH to a Chromium binary.");
}

const posts = readdirSync(join(root, "writing"))
	.filter((f) => f.endsWith(".md"))
	.map((f) => ({ slug: f.slice(0, -3), ...frontMatter(join(root, "writing", f)) }))
	.filter((p) => p.title && p.draft !== "true")
	.filter((p) => redrawAll || !existsSync(join(outDir, `${p.slug}.png`)));

if (!posts.length) {
	console.log("Every post already has a card. Use --all to redraw them.");
	process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const tmpFile = join(tmpdir(), `og-card-${process.pid}.html`);
try {
	for (const post of posts) {
		// A file:// page, so it can load the fonts from the repo.
		writeFileSync(tmpFile, card(post));
		await page.goto(pathToFileURL(tmpFile).href);
		await fit(page);
		await page.screenshot({ path: join(outDir, `${post.slug}.png`) });
		console.log(`images/og/${post.slug}.png`);
	}
} finally {
	rmSync(tmpFile, { force: true });
	await browser.close();
}
