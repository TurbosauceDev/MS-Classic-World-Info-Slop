# Journal (the site's blog)

Danny 2026-11-03: the home page has an Updates strip (the three newest changelog cards) and a Journal section.
Posts are plain text files in the repo; the site build does everything else. **Hermes's Discord bridge writes these
files** - a post typed in Discord becomes one commit to `src/posts/`, and the next build ships it.

Turbozo, later the same day: Home became a full newsfeed in the serebii.net shape - one column grouped by day,
newest posts rendered in full with the newest changelog cards between them as rows (`77-journal.js`, caps: 8 posts
and 6 updates). The old home grid of section links moved to the **Overview** page (`src/pages/overview.html`,
`#overview`). Drafts can start anywhere comfortable - a Google Doc, a Discord message - and any agent converts the
draft into the same `src/posts/` file, contract unchanged. A watcher cron that posts when official Nexon news drops
would file through this exact same path.

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
- Every auto link carries `data-ent="kind:id"` (77-journal.js): hovering a mention shows the same game-data
  tooltip as the database pages (Turbozo 2026-11-04); the click keeps its clean route.
- Back from an entity page lands the reader back in the article at the same spot (Turbozo 2026-11-04): the site
  owns scroll restoration (`75-history.js`, `navx:` sessionStorage mirror; deep-link documents never restore).

## Plumbing

- `scripts/build.py` renders posts into `POSTS` (`src/js/77-journal.js`); Home shows the merged newsfeed
  (newest posts + newest changelog cards, day-grouped) and the Journal page (`#journal`, footer link "Journal")
  lists every post, newest first.
- Smoke tests (`tests/smoke.js`) pin the machinery, never post content, so a good post can't fail CI.
- A new post needs no other change: commit the file (any order of posts in one commit is fine), push to `main`.
  The pages deploy picks it up like any other push.
- To retire a sample post, delete its file: `src/posts/2026-11-03-welcome-to-the-journal.md` or
  `src/posts/2026-11-03-what-a-post-can-carry.md`.
