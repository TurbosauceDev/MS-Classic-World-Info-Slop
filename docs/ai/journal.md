# Journal (the site's blog)

Danny 2026-11-03: the home page has an Updates strip (the three newest changelog cards) and a Journal section.
Posts are plain text files in the repo; the site build does everything else. **Hermes's Discord bridge writes these
files** - a post typed in Discord becomes one commit to `src/posts/`, and the next build ships it.

## File contract

One post = `src/posts/<YYYY-MM-DD>-<slug>.md` (lower case, dashes; the file name date must match the front matter date):

```
---
title: The title of the post
date: 2026-11-03
author: Turbozo
---
The body, in the dialect below.
```

- `title` and `date` are required; `author` is optional and defaults to `Turbozo`.
- Any other front matter key, a missing block or an empty body fails the build on purpose (the bridge sees the
  error immediately). `tests/posts_test.py` checks all of this in CI.

## Body dialect

`## / ###` headings, paragraphs (blank line between), `**bold**`, `*italics*`, `` `code` ``, `- ` lists,
`> ` quotes, `[text](url)` links (`https://...` opens in a new tab, site-relative `/items/...` stays),
`---` for a rule. Anything else - raw HTML included - shows as plain text. The body is escaped before
formatting, so a post can never inject markup. No secrets in posts: they ship to a public site.

## Auto links

Names of monsters, items, quests and skills from the game data link themselves to their pages on the site
(`scripts/posts.py` at build time, paths from `scripts/routes.py`). Rules:

- The first mention of a name links, any capitalization; later mentions stay text.
- Never inside `code`, a heading or an existing link; at most 40 links per post.
- Names under 4 letters never link. A name two entries share opens the "which one?" page.
- Spelling must match the game exactly - "Blue Snails" (plural) stays text, "Blue Snail" links.

## Plumbing

- `scripts/build.py` renders posts into `POSTS` (`src/js/77-journal.js`); home shows the latest post and the
  Journal page (`#journal`, footer link "Journal") lists every post, newest first.
- Smoke tests (`tests/smoke.js`) pin the machinery, never post content, so a good post can't fail CI.
- A new post needs no other change: commit the file (any order of posts in one commit is fine), push to `main`.
  The pages deploy picks it up like any other push.
- To retire the sample post, delete `src/posts/2026-11-03-welcome-to-the-journal.md`.
