import { existsSync } from "node:fs";

// Defaults for everything in writing/. Posts are Markdown files here, published at /writing/<file name>/.
//
// Front matter for a post:
//   title:        required
//   description:  one or two sentences; used in the post list, meta tags and the feed
//   date:         YYYY-MM-DD, the publish date
//   updated:      optional YYYY-MM-DD, when it last changed meaningfully
//   draft:        true keeps it out of `npm run build` (it still shows in `npm start`)
//   ogImage:      optional path such as /images/my-post.png (1200×630). Without it, a post uses
//                 its own card from `npm run og` (images/og/<file name>.png) if there is one,
//                 and the site card (/images/og.png) if not.
//   ogImageAlt:   alt text for ogImage
export default {
	layout: "layouts/post.njk",
	eleventyComputed: {
		ogImage: (data) => {
			if (data.ogImage) return data.ogImage;
			const card = `/images/og/${data.page.fileSlug}.png`;
			if (data.pageType === "post" || data.page.inputPath.endsWith(".md")) {
				if (existsSync(`.${card}`)) return card;
				console.warn(`[og] No link-preview card for ${data.page.inputPath}. Run \`npm run og\`.`);
			}
			return undefined;
		},
		ogImageAlt: (data) =>
			data.ogImageAlt || (data.ogImage ? `${data.title}, a post by Jagrit Vats` : undefined),
	},
};
