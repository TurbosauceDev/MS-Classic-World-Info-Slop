# MS Classic World Data Slop
Planner for MapleStory Classic World built from the launch (Steam) client game files via the OSMS export (pinned commit c661434, Oct 17 2026): character builder, training-map ranking,
quest database, citizenship. See CLAUDE.md for layout/workflow and docs/notes.md for formulas and sources.

```
./scripts/fetch_osms.sh && python3 scripts/build_data.py && python3 scripts/build.py
open dist/index.html
```

## Licence
Source-available under the PolyForm Noncommercial License 1.0.0 (`LICENSE`): free for personal and other noncommercial use, no commercial use without permission. What the licence does and doesn't cover: `NOTICE.md`.
