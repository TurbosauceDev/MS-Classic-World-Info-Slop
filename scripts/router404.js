/* 404.html router (scripts/pages_gen.py inlines this): GitHub Pages is static, so any address that is not a real page
   lands here. It reads /routes.json and sends the visitor to the ONE canonical page, whichever way they spelled it:
   /skills/1100001  /skills/arrow-blow  /skills/warrior/fighter/axe-mastery  /spell=1100001/axe-mastery
   /item=1442005/axe-pole-arm  /items/axe-pole-arm  /monster/stirge ...
   Tested by tests/routes_test.py (loads this file in node with a fake location/fetch/document). */
(async function(){
  var seg = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  var box = document.getElementById("nf");
  if (!seg.length) return;
  var T; try { T = await (await fetch("/routes.json")).json() } catch (e) { return }
  var norm = function(s){ return String(s).toLowerCase().normalize("NFKD").replace(/[^\x00-\x7f]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") };
  var canon = function(k, x){ return "/" + T.kinds[k] + "/" + x[2] + x[1] + (x[3] ? "-" + x[0] : "") + "/" };
  var go = function(p){ location.replace(p) };
  var kind = null, rest = seg.slice(), m = /^([a-z]+)=(.+)$/i.exec(seg[0]);
  if (m && T.synonyms[m[1].toLowerCase()]){ kind = T.synonyms[m[1].toLowerCase()]; rest = [m[2]].concat(seg.slice(1)) }
  else if (T.synonyms[seg[0].toLowerCase()]){ kind = T.synonyms[seg[0].toLowerCase()]; rest = seg.slice(1) }
  var toks = rest.map(norm).filter(Boolean);
  if (kind && !toks.length) return go("/" + T.kinds[kind] + "/");
  // skills: a class or job on its own opens that list
  if (kind === "skill" && toks.length === 1 && T.jobs[toks[0]]){
    var c = T.jobs[toks[0]]; return go(toks[0] === c ? "/skills/" + c + "/" : "/skills/" + c + "/" + toks[0] + "/") }
  if (kind === "skill" && toks.length === 1 && T.classes.indexOf(toks[0]) >= 0) return go("/skills/" + toks[0] + "/");
  var kinds = kind ? [kind] : Object.keys(T.e), exact = [], near = [];
  var slugs = toks.filter(function(t){ return !/^\d+$/.test(t) }), ids = toks.filter(function(t){ return /^\d+$/.test(t) });
  var last = slugs[slugs.length - 1];
  kinds.forEach(function(k){ T.e[k].forEach(function(x){
    var hit = ids.some(function(i){ return i === x[0] });
    if (!hit && last){
      var parents = x[2].split("/");
      var s = x[1] === last || (x[3] && last === x[1] + "-" + x[0]);
      hit = s && slugs.slice(0, -1).every(function(t){ return parents.indexOf(t) >= 0 }) }
    if (hit) exact.push([k, x]);
    else if (last && last.length >= 3 && (x[1].indexOf(last) >= 0 || (x[1].length >= 5 && last.indexOf(x[1]) >= 0))) near.push([k, x]) }) });
  // an id that matches wins over the slug beside it
  if (ids.length){ var byId = exact.filter(function(h){ return ids.indexOf(h[1][0]) >= 0 }); if (byId.length) exact = byId }
  if (exact.length === 1) return go(canon(exact[0][0], exact[0][1]));
  if (exact.length > 1 && kind){
    var ps = {}; exact.forEach(function(h){ ps[h[1][2]] = 1 });
    var h0 = exact[0][1];
    return go(Object.keys(ps).length > 1 ? "/skills/" + h0[1] + "/" : "/" + T.kinds[kind] + "/" + h0[2] + h0[1] + "/") }
  // the planner's own pages too (Turbozo 2026-11-04 "vibe out our links"): /worldmap/ or
  // /grind-tracker/kpqtimer/ land on the page they mean, hyphens optional
  var pg = T.pages || {}, want = "/" + toks.join("/") + "/", bare = want.replace(/-/g, "");
  for (var p in pg){ if (p === want || p.replace(/-/g, "") === bare) return go(p) }
  var list = exact.length ? exact : near.sort(function(a, b){ return (b[1][1].indexOf(last) === 0) - (a[1][1].indexOf(last) === 0) || a[1][1].localeCompare(b[1][1]) });
  if (!box) return;
  var head = box.querySelector("p");
  if (list.length){
    if (head) head.textContent = exact.length ? "More than one page matches:" : "No page has exactly that address. Did you mean:";
    box.insertAdjacentHTML("beforeend", '<ul class="cols">' + list.slice(0, 40).map(function(h){
      var p = canon(h[0], h[1]); return '<li><a href="' + p + '">' + p.replace(/^\/|\/$/g, "").replace(/\//g, " / ") + "</a></li>" }).join("") + "</ul>");
  }
})();
