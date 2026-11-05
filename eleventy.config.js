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
	eleventyConfig.ignores.add("deploy/**");
	eleventyConfig.ignores.add(".github/**");
	eleventyConfig.ignores.add(".claude/**");
	eleventyConfig.ignores.add(".vscode/**");
	eleventyConfig.ignores.add("node_modules/**");

	// Files served as they are.
	for (const path of [
		"style.css",
		"writing.css",
		"main.css",
		"script.js",
		"favicon.ico",
		"favicon.svg",
		"apple-touch-icon.png",
		"robots.txt",
		"fonts",
		"images",
		"imagesv2",
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

	// ---- Plugins ----
	eleventyConfig.addPlugin(syntaxHighlight, {
		// Highlighting happens at build time; pages ship no highlighting JS.
		preAttributes: { tabindex: 0 },
	});
	eleventyConfig.addPlugin(pluginRss); // dateToRfc3339, getNewestCollectionItemDate, renderTransforms

	// ---- Filters ----
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
	eleventyConfig.addFilter("latestDate", (dates) =>
		profile.isoDate(Math.max(...dates.filter(Boolean).map((d) => new Date(d).getTime()))),
	);
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
