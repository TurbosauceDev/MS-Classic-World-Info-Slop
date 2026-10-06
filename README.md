# MS Classic World Data Slop
Planner for MapleStory Classic World built from the COT2 game files: character builder, training-map ranking,
quest database, citizenship. See CLAUDE.md for layout/workflow and docs/notes.md for formulas and sources.

```
./scripts/fetch_osms.sh && python3 scripts/build_data.py && python3 scripts/build.py
open dist/index.html
```
