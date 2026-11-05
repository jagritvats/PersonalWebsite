---
title: Placeholder post
description: A draft that shows how each kind of block looks in the post layout. It is never published.
date: 2026-11-05
draft: true
---

This is a placeholder, not an article. It exists to check the post layout while there are no real posts: paragraphs, headings, lists, code, a quote and a diagram. Because it is marked `draft: true`, it appears in `npm start` but is left out of `npm run build`. Delete it or replace it with the first real post.

## A second-level heading

Body text is set in Newsreader with a measure of about 38rem. Inline code such as `npm run build` sits on a tinted background, and [links](/writing/) use the same underline as the rest of the site.

- A short list item.
- Another item, long enough to wrap onto a second line so the hanging indent and line spacing can be checked.
- A third item.

### A third-level heading

1. Numbered lists use the normal counters.
2. Second step.

## Code

Fenced code blocks are highlighted when the site is built, so the page needs no script for it. This sample is a made-up function, not taken from any project.

```js
// Example only: retry a task a few times before giving up.
async function withRetries(task, attempts = 3) {
	let lastError;
	for (let i = 1; i <= attempts; i++) {
		try {
			return await task();
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}
```

```bash
npm ci
npm run build
```

Template tags such as `{{ title }}` print as written, because Markdown isn't run through Nunjucks.

## A quote

> Block quotes get a gold rule on the left and are set in italic. This one is placeholder text, not a quotation from anyone.

## A diagram

Diagrams are inline SVG that use the same classes as the ones on the homepage, so they follow the light and dark themes. The figure must not contain blank lines, or Markdown will end the HTML block early.

<figure class="diagram post__figure">
	<svg class="dg" viewBox="0 30 360 60" role="img" aria-labelledby="example-title example-desc">
		<title id="example-title">Example diagram</title>
		<desc id="example-desc">Three boxes in a row, labelled input, step and output, joined by arrows.</desc>
		<defs>
			<marker id="post-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
				<path class="ah" d="M0 1 L9 5 L0 9 Z" />
			</marker>
		</defs>
		<path class="e" d="M100 60 H136" marker-end="url(#post-ah)" />
		<path class="e e--ok" d="M224 60 H260" marker-end="url(#post-ah)" />
		<g class="node"><rect x="12" y="36" width="88" height="48" rx="6" /><text class="t" x="56" y="64" text-anchor="middle">Input</text></g>
		<g class="node node--retry"><rect x="136" y="36" width="88" height="48" rx="6" /><text class="t" x="180" y="64" text-anchor="middle">Step</text></g>
		<g class="node node--ok"><rect x="260" y="36" width="88" height="48" rx="6" /><text class="t" x="304" y="64" text-anchor="middle">Output</text></g>
	</svg>
	<figcaption>A caption explains what the diagram shows.</figcaption>
</figure>

That's the end of the placeholder.
