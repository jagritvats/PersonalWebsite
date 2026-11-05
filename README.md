# Jagrit Vats - [My Personal Website](https://jagritvats.com/)

My personal website: work, projects, writing and contact details.

It's built with [Eleventy](https://www.11ty.dev/) (v3) into plain static files. You need Node 20 or later.

```bash
npm ci          # once
npm start       # dev server with live reload at http://localhost:8080 (drafts included)
npm run build   # production build into _site/ (drafts left out)
```

Pushing to `main` builds a Docker image (Node builds the site, nginx serves `_site/`) and deploys it to
the VM at https://jagritvats.com/ — see [deploy/README.md](deploy/README.md). To run that image locally:
`docker build -f deploy/Dockerfile -t site . && docker run --rm -p 8080:80 site`.

## Where things are

| Path | What it is |
|---|---|
| `index.html` | The homepage. Mostly hand-written HTML; Eleventy runs it through Nunjucks. |
| `_data/profile.json` | **The profile**: person, jobs, projects, skills, education, contact. |
| `_data/site.js` | Site URL, language, default link-preview image, the Writing title. |
| `_lib/profile.js` | Turns the profile into JSON-LD, `resume.json` and `llms.txt`. |
| `_includes/partials/` | The `<head>` assets, header and footer shared by every page. |
| `_includes/layouts/` | Layouts for the writing pages (`base.njk`) and posts (`post.njk`). |
| `writing/` | Posts, one Markdown file each, plus the `/writing/` index. |
| `style.css` | The site's styles and colour tokens. |
| `writing.css` | Extra styles for the writing pages: long-form type, code blocks. |
| `script.js` | Theme toggle, footer year and the hero diagram animation. |
| `llms.txt.11ty.js`, `resume.json.11ty.js`, `sitemap.xml.njk`, `feed.xml.njk` | Generated files. |

- The project diagrams are inline SVG in `index.html`, styled from the colour tokens at the top of `style.css`.
- `images/og.png` is the link-preview image (1200×630).
- `fonts/` holds self-hosted copies of Archivo and Newsreader (SIL Open Font License, licence
  files included), so the page doesn't wait on Google Fonts. Archivo is Google Fonts' own Latin
  file. Newsreader is the Latin subset of the variable font with weight fixed at 400 and optical
  sizing kept, which renders identically to Google's copy. They only cover Latin text, and
  Newsreader only weight 400: if you add text in another script, or bold serif text, rebuild them
  from the full fonts on Google Fonts.
- Files served as they are (CSS, JS, fonts, images, favicons, `robots.txt`) are listed in
  `eleventy.config.js`. Add new top-level static files there, or they won't be published.

## Updating the profile

Edit `_data/profile.json`, then set its `updated` date to today. From that one file the build makes:

- the JSON-LD block in the `<head>` of the homepage (read by search engines), including `dateModified`
- the homepage's Work, Tools, Education and Contact sections
- `/llms.txt`, a plain-text summary for AI assistants
- `/resume.json`, a résumé in [JSON Resume](https://jsonresume.org/) format
- `/sitemap.xml`, whose `lastmod` comes from `updated` and the post dates

Where the page, the résumé and `llms.txt` word something differently, the value is an object
instead of a string: `text` is the shared wording and `page`, `llms` or `resume` override it for
that output. For example a job highlight reads "Lead a team…" on the page and "Leads a team…" in
`llms.txt`; both versions sit next to each other, so you edit them together.

Still hand-written in `index.html`, so check them when the profile changes:

- the `<title>`, meta description and Open Graph text at the top of `<head>`
- the hero (name, lead and summary) and its email/GitHub/LinkedIn buttons
- the project write-ups and their diagrams (the short project descriptions in `llms.txt`,
  `resume.json` and the JSON-LD come from `profile.json`)

## Writing

Posts are Markdown files in `writing/`, published at `/writing/<file name>/`. Front matter:

```yaml
---
title: The post title
description: One or two sentences for the post list, link previews and the feed.
date: 2026-11-05
updated: 2026-11-20   # optional
draft: true           # optional: shown by npm start, left out of npm run build
---
```

- Each post gets a canonical URL, Open Graph and Twitter tags, and `BlogPosting` JSON-LD.
  Set `ogImage: /images/<name>.png` (1200×630) and `ogImageAlt` to use a preview image other than `images/og.png`.
- Published posts are listed at `/writing/`, in the Atom feed at `/feed.xml`, in `llms.txt` and in the sitemap.
- The Writing link in the header and the Writing section on the homepage only appear once at least
  one post is published. Until then `/writing/` says "Nothing published yet" and asks search engines
  not to index it.
- Fenced code blocks are highlighted at build time (Prism, via
  `@11ty/eleventy-plugin-syntaxhighlight`); the colours are in `writing.css` and follow the theme.
- Markdown isn't run through Nunjucks, so `{{ }}` in code samples prints as written.
- Diagrams can be inline SVG using the same `.dg` classes as the homepage; see
  `writing/placeholder.md`. Keep blank lines out of the `<figure>`, or Markdown ends the HTML block early.
- To check drafts in a production-style build: `DRAFTS=1 npm run build` (PowerShell:
  `$env:DRAFTS=1; npm run build`).

`writing/placeholder.md` is a draft that shows every kind of block. Delete it when the first real post goes in.
