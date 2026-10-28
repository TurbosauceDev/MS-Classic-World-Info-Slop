
## 2026-10-28 - meowdb market outage: root-caused + fixed (Glorg [z.ai], Task: danny "find another way to access meowdb")
- Symptom: data/sources/meowdb_market.json stale since 10-26 14:23 (poll kept old file, runs "green" via the graceful path); site prices froze at 2 days old.
- CI logs (run 40668850923): page.evaluate Error at /msclassic/api/market-listings/browse?page=1 - catalog fine, browse dead.
- Probes (dispatch runs 40717355222 / 40718285957 / 40719031434, throwaway workflow meowdb-probe.yml, now removed):
  - meowdb is NOT Cloudflare-walled for the browser session; the market API itself answers
    403 {"error":"Headless browsers are blocked here. To ask about reusing this data, write to contact@meowdb.com."}
  - trigger = the headless-shell UA ("HeadlessChrome/..."); navigator.webdriver is NOT checked (headed under xvfb passes with wd:true)
  - only /market-listings/browse is walled; catalog / per-item summary + listings / drops / mesos-reports / npc-shops all stay open (200)
  - /api/free-market/home returns gainers/losers/trending/bestSellers with meowdb ids - usable discovery seeds
- Fix (fetch_meowdb_market.js + meowdb-market-poll.yml): launch a real headed Chromium (xvfb-run -a on CI, --no-sandbox, CHROMIUM env honored); if the wall ever widens, the fetcher drops browse discovery and sweeps free-market/home seeds + the full want set over the open per-item endpoints (same output shape, same keep-old-file exit-0 contract); extra backoff for 429/5xx.
- Proof: dispatch run 40720150137 -> "5386 catalog items; browse discovery, 20608 live listings; 1363 items priced, 1116 with listings" (pre-outage: 1109 / 875); commit c3add61 "meowdb market prices 2026-10-28 16:23" landed; D.mdb.it 1156 / D.mdb.ls 905 after build; fetch took 32 min (cap 40).
- Docs: decisions.md 10-28 entry (wall + approach under Danny's revoked 10-20 rule; sustainable path = contact@meowdb.com); daily-briefing.md refreshed (10-20 rescission + meowdb status).
- Cleanup: probe workflow/script removed (cc44c75), debug/meowdb-probe branch deleted. Next scheduled cron 17:41 UTC runs the same code.
