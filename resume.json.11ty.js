// Generates /resume.json (JSON Resume v1.0.0) from _data/profile.json.
import { resume, formatResume } from "./_lib/profile.js";

export const data = {
	permalink: "/resume.json",
	eleventyExcludeFromCollections: true,
};

export function render({ profile, site }) {
	return formatResume(resume(profile, site));
}
