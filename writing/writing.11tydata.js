// Defaults for everything in writing/. Posts are Markdown files here, published at /writing/<file name>/.
//
// Front matter for a post:
//   title:        required
//   description:  one or two sentences; used in the post list, meta tags and the feed
//   date:         YYYY-MM-DD, the publish date
//   updated:      optional YYYY-MM-DD, when it last changed meaningfully
//   draft:        true keeps it out of `npm run build` (it still shows in `npm start`)
//   ogImage:      optional path such as /images/my-post.png (1200×630); defaults to /images/og.png
//   ogImageAlt:   alt text for ogImage
export default {
	layout: "layouts/post.njk",
};
