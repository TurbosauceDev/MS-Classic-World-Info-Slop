/* Performance monitor (Help > Performance monitor): live load of the tracker on this PC. Process CPU/memory from the main
   process (app.getAppMetrics), reader timings from PERF (renderer-live.js), maths + warnings in core/perfwatch.js.
   Polls every 2 s only while the pop-up is open, so it costs nothing otherwise. */
let perfTimer = null, perfPrev = null;
const esc2 = s => String(s).replace(/[&<>]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c]));
async function perfRefresh(){
  const rows = GrindPerf.procs(await (host.perfMetrics?.() ?? Promise.resolve(null)).catch(() => null)), now = Date.now(), n = PERF.tick?.n || 0;
  let rate = null;
  if (perfPrev && n >= perfPrev.n && now > perfPrev.t) rate = (n - perfPrev.n) / ((now - perfPrev.t) / 1000);
  perfPrev = {n, t: now};
  const reading = timer != null && PERF.tick, st = GrindPerf.stages(PERF, now - perfT0), w = GrindPerf.warnings(rows, reading ? st : {}, reading ? rate : null, reading ? FPS : 0);
  const f = (v, d = 1) => v == null ? "-" : v.toFixed(d);
  $("#perfWarn").innerHTML = w.list.length ? w.list.map(x => `<div class="note" style="color:var(--bad,#e5534b);font-weight:600">⚠ ${esc2(x)}</div>`).join("") : `<div class="note" style="color:var(--good,#4caf50)">Load looks fine.</div>`;
  $("#perfBody").innerHTML =
    `<b>Total</b>: ${w.cpu}% of one core, ${w.mem} MB<table style="width:100%;margin:6px 0"><tr><th align=left>Process</th><th align=right>CPU %</th><th align=right>Memory MB</th></tr>`
    + rows.map(r => `<tr><td>${esc2(r.name)}</td><td align=right>${r.cpu}</td><td align=right>${r.mem}</td></tr>`).join("") + `</table>`
    + (reading
      ? `<b>Screen reading</b>: ${rate == null ? "-" : rate.toFixed(1)} reads a second (wanted ${FPS}), ${skipped} frames skipped as unchanged, busy ${f(st.busy, 0)}% of the time<table style="width:100%;margin:6px 0"><tr><th align=left>Step</th><th align=right>avg ms</th></tr>`
        + [["Capture the game picture", st.grab], ["Compare with the last picture", st.same], ["Read it (EXP, loot, bars...)", st.read], ["Whole pass", st.tick]].map(([k, v]) => `<tr><td>${k}</td><td align=right>${f(v)}</td></tr>`).join("")
        + `<tr><td>Slowest read</td><td align=right>${f(st.readMax, 0)}</td></tr></table>`
      : `<b>Screen reading</b>: not running. Press Start to see the read rate and step times.`);
}
function openPerf(){ perfPrev = null; perfRefresh(); clearInterval(perfTimer); perfTimer = setInterval(perfRefresh, 2000); modalOpen($("#perfPop"), $("#perfClose")) }
function closePerf(){ clearInterval(perfTimer); perfTimer = null; modalClose($("#perfPop")) }
$("#perfClose").onclick = closePerf;
$("#perfPop")._close = closePerf;
