# Jagrit Vats - [My Personal Website](https://jagritvats.netlify.app/)

My personal website: work, projects and contact details.

It's a single static page with no build step: `index.html`, `style.css` and `script.js`.
To preview it, run `python -m http.server` in this folder and open http://localhost:8000
(opening the file directly works too, but the browser blocks the font preloads). Pushing to `main`
deploys it to Netlify and to [GitHub Pages](https://jagritvats.github.io/PersonalWebsite/).

- The project diagrams are inline SVG in `index.html`, styled from the colour tokens at the top of `style.css`.
- `images/og.png` is the link-preview image (1200×630).
- `fonts/` holds self-hosted copies of Archivo and Newsreader (SIL Open Font License, licence
  files included), so the page doesn't wait on Google Fonts. Archivo is Google Fonts' own Latin
  file. Newsreader is the Latin subset of the variable font with weight fixed at 400 and optical
  sizing kept, which renders identically to Google's copy. They only cover Latin text, and
  Newsreader only weight 400: if you add text in another script, or bold serif text, rebuild them
  from the full fonts on Google Fonts.

## Keep these in sync

The same profile exists in four places. When you change your role, location, projects or skills,
update all of them:

- the visible page in `index.html`
- the JSON-LD block in the `<head>` of `index.html` (read by search engines)
- `llms.txt`, a plain-text summary for AI assistants
- `resume.json`, a résumé in [JSON Resume](https://jsonresume.org/) format

Also bump `lastmod` in `sitemap.xml` and `dateModified` in the JSON-LD.
