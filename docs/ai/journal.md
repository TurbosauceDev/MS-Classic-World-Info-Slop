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

Turbozo, 2026-11-04 (the wowhead-shaped format): site updates are posts on the feed now, not changelog-link rows -
the newest changelog entries render as full cards authored by **Glorg** (still read live from `#log`, so they can
never drift from the changelog). Every card wears its poster's avatar and can carry a main image, folds past a max
body length behind a frosted cutoff, and minimizes to its header on a click (again to reopen; remembered per post
in sessionStorage `jx:<slug>`). Comments live in the reader's browser (localStorage `jc:<slug>`,
`jcl:<slug>` likes, `jcwho` name) - a shared/backend box replaces `cLoad`/`cSave` in `77-journal.js` alone.

Turbozo, 2026-11-04 (a feed of pages): a card's title, image or continue-reading opens **the article** - its own
page (the Journal page's article view, deep link `#a=<slug>`) with the full body and the comment box; comments are
no longer on the feed cards. Every article also gets a real static page `scripts/pages_gen.py` writes at
`/news/<slug>/` (update posts included, slugs mirroring `77-journal.js`): link previews get title, description and
`og:image` (the post image copied to `/news/img/`), and people are redirected into the app's article view. The
feed gained a tag filter (`tags:` front matter; canonical list in `scripts/posts.py` TAGS, default Blog Post) and
a featured hero (`featured: true` puts the newest featured post up top).

## File contract

One post = `src/posts/<YYYY-MM-DD>-<slug>.md` (lower case, dashes; the file name date must match the front matter date):

```
---
title: The title of the post
date: 2026-11-03
author: Turbozo
image: img/welcome-to-the-journal.jpg
tags: Guide, Maple News
featured: true
---
The body, in the dialect below.
```

- `title` and `date` are required; `author` is optional and defaults to `Turbozo`; `image` is optional (the post's
  main image) and must be a PNG/JPEG file under `src/posts/` (usually the `src/posts/img/` folder), under 200 KB - it is baked into the
  page as a data URI, so remote URLs and `..` paths fail the build.
- `tags` is optional: a comma-separated list shown as filter pills on the feed and on the article. The canonical
  tags (scripts/posts.py TAGS) are Maple News, Maple Patch Notes, Maple Misc, Site Updates, Blog Post, Guide,
  Event, Market - Site Updates is reserved for the changelog entries; a post without tags reads as Blog Post.
  Free-form extra tags are fine; the feed's filter row lists the tags posts actually carry.
- `featured` is optional (`true`/`false`): the newest featured post leads the feed in the hero slot.
- Any other front matter key, a missing block or an empty body fails the build on purpose (the bridge sees the
  error immediately). `tests/posts_test.py` checks all of this in CI.

## Avatars

`src/posts/avatars/<author>.png` (file name lower-cased) is the sprite a poster's cards wear: `turbozo.png` is the
green Slime, `glorg.png` (the site-update posts) the Orange Mushroom - both pulled from the game files by
`scripts/make_post_art.py`, which also bakes the sample posts' banners into `src/posts/img/`. A poster without a
file gets a colored letter chip; an avatar over 20 KB fails the build (it rides the whole page).

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
- Smoke pins the card machinery, never the content: fold + continue reading, click-to-minimize (remembered in
  `jx:<slug>`), avatar images, comment post/reply/like, and that a post's main image loads when it has one.
- To retire a sample post, delete its file: `src/posts/2026-11-03-welcome-to-the-journal.md` or
  `src/posts/2026-11-03-what-a-post-can-carry.md` (and its image in `src/posts/img/`).
