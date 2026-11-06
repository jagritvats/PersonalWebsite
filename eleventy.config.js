import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import pluginRss from "@11ty/eleventy-plugin-rss";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";

import * as profile from "./_lib/profile.js";

// Drafts (`draft: true` in front matter) show up in `npm start`, and are left out of
// `npm run build` unless you set DRAFTS=1.
const includeDrafts = () =>
	process.env.ELEVENTY_RUN_MODE !== "build" || ["1", "true"].includes(process.env.DRAFTS);

export default function (eleventyConfig) {
	// ---- What gets built ----
	// The repo root is the input folder, so keep the non-site files out.
	eleventyConfig.ignores.add("README.md");
	// Any other Markdown at the top level (AGENTS.md, CLAUDE.md, notes) is not a page.
	// Posts live in writing/.
	eleventyConfig.ignores.add("*.md");
	eleventyConfig.ignores.add("deploy/**");
	eleventyConfig.ignores.add(".github/**");
	eleventyConfig.ignores.add(".claude/**");
	eleventyConfig.ignores.add(".vscode/**");
	eleventyConfig.ignores.add("node_modules/**");

	// Files served as they are.
	for (const path of [
		"style.css",
		"writing.css",
		"script.js",
		"favicon.ico",
		"favicon.svg",
		"favicon-48x48.png",
		"favicon-96x96.png",
		"icon-192.png",
		"icon-512.png",
		"icon-maskable-512.png",
		"site.webmanifest",
		"apple-touch-icon.png",
		"robots.txt",
		"fonts",
		"images",
	]) {
		eleventyConfig.addPassthroughCopy(path);
	}

	// ---- Drafts ----
	eleventyConfig.addPreprocessor("drafts", "*", (data) => {
		if (data.draft && !includeDrafts()) return false;
	});

	// ---- Posts ----
	// Newest first. Drafts never reach this list in a production build.
	eleventyConfig.addCollection("posts", (collectionApi) =>
		collectionApi.getFilteredByGlob("writing/*.md").sort((a, b) => b.date - a.date),
	);

	// ---- Content-Security-Policy check ----
	// deploy/security-headers.conf allows inline scripts only by hash. If an inline
	// script changes, fail the build and print the hash to paste there, rather than
	// shipping a page whose script the browser will block.
	eleventyConfig.on("eleventy.after", async ({ results }) => {
		const policy = await readFile(new URL("./deploy/security-headers.conf", import.meta.url), "utf8");
		const missing = new Set();
		for (const { outputPath, content } of results) {
			if (!outputPath?.endsWith(".html")) continue;
			for (const [, attrs, body] of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
				if (/\bsrc=/.test(attrs) || /application\/ld\+json/.test(attrs)) continue;
				const hash = `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
				if (!policy.includes(hash)) missing.add(`${hash} (${outputPath})`);
			}
		}
		if (missing.size) {
			throw new Error(
				`Inline script not allowed by the CSP in deploy/security-headers.conf. Add to script-src:\n  ${[...missing].join("\n  ")}`,
			);
		}
	});

	// ---- Plugins ----
	eleventyConfig.addPlugin(syntaxHighlight, {
		// Highlighting happens at build time; pages ship no highlighting JS.
		preAttributes: { tabindex: 0 },
	});
	eleventyConfig.addPlugin(pluginRss); // dateToRfc3339, getNewestCollectionItemDate, renderTransforms

	// ---- Filters ----
	// "/style.css" -> "/style.css?v=<hash of the file>". nginx caches CSS and JS for a
	// year, so the URL has to change whenever the file does.
	const assetHashes = new Map();
	eleventyConfig.on("eleventy.before", () => assetHashes.clear());
	eleventyConfig.addFilter("versioned", (url) => {
		if (!assetHashes.has(url)) {
			const bytes = readFileSync(new URL(`.${url}`, import.meta.url));
			assetHashes.set(url, createHash("sha256").update(bytes).digest("hex").slice(0, 10));
		}
		return `${url}?v=${assetHashes.get(url)}`;
	});
	eleventyConfig.addFilter("pick", profile.pick);
	eleventyConfig.addFilter("monthYear", profile.monthYear);
	eleventyConfig.addFilter("rolePeriod", profile.rolePeriod);
	eleventyConfig.addFilter("jobPeriod", profile.jobPeriod);
	eleventyConfig.addFilter("currentRole", profile.currentRole);
	eleventyConfig.addFilter("sentenceCase", profile.sentenceCase);
	eleventyConfig.addFilter("phoneDisplay", profile.phoneDisplay);
	eleventyConfig.addFilter("phoneTel", profile.phoneTel);
	eleventyConfig.addFilter("degreeName", profile.degreeName);
	eleventyConfig.addFilter("degreeSummary", profile.degreeSummary);
	eleventyConfig.addFilter("isoDate", profile.isoDate);
	eleventyConfig.addFilter("readableDate", profile.readableDate);
	eleventyConfig.addFilter("homeJsonLd", (p, site) =>
		profile.jsonForScript(profile.homeJsonLd(p, site), "\t\t\t"),
	);
	eleventyConfig.addFilter("postJsonLd", (post, p, site) =>
		profile.jsonForScript(profile.postJsonLd(post, p, site), "\t\t\t"),
	);
	// Newest of a list of dates (strings or Date objects), as YYYY-MM-DD.
	eleventyConfig.addFilter("latestDate", (dates) => {
		const times = dates.filter(Boolean).map((d) => new Date(d).getTime());
		if (!times.length) throw new Error("latestDate needs at least one date");
		return profile.isoDate(Math.max(...times));
	});
	// When each post last changed: its `updated` front matter, or its publish date.
	eleventyConfig.addFilter("postDates", (posts) => posts.map((post) => post.data.updated || post.date));

	return {
		dir: {
			input: ".",
			includes: "_includes",
			data: "_data",
			output: "_site",
		},
		templateFormats: ["html", "njk", "md", "11ty.js"],
		htmlTemplateEngine: "njk",
		// Markdown isn't run through Nunjucks, so {{ }} and {% %} in code samples print as written.
		markdownTemplateEngine: false,
	};
}
