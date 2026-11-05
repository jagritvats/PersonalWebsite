// Generates /llms.txt (https://llmstxt.org/) from _data/profile.json and the published posts.
import { llms } from "./_lib/profile.js";

export const data = {
	permalink: "/llms.txt",
	eleventyExcludeFromCollections: true,
};

export function render({ profile, site, collections }) {
	return llms(profile, site, collections.posts);
}
