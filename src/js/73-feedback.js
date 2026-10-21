// Feedback page (Danny 2026-10-21): visitors leave a note, the tracker's Worker keeps it (POST /api/feedback, see
// server/src/index.js for the limits). The owner reads them in "Inbox (site owner)" with the FEEDBACK_KEY Worker secret,
// kept in this browser (localStorage fbkey) once it works.
(() => {
  const API = TRK_API.replace(/summary$/, "feedback"), MIN = 5, MAX = 2000;
  const ls = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch(e) {} };
  const lg = k => { try { return localStorage.getItem(k) || "" } catch(e) { return "" } };
  let kind = "Idea", from = "", busy = false;
  // the page a note was written from: the last page open before Feedback
  for (const b of TABS) b.addEventListener("click", () => { if (b.dataset.tab !== "feedback") from = b.dataset.tab });

  const msg = $("#fbmsg"), send = $("#fbsend"), stat = $("#fbstat");
  const check = () => { const n = msg.value.trim().length;
    $("#fbcount").textContent = `${fmt(msg.value.length)} / ${fmt(MAX)}`;
    $("#fbcount").classList.toggle("warn", msg.value.length > MAX - 100);
    send.disabled = busy || n < MIN };
  msg.addEventListener("input", check);
  $("#fbkind").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return; kind = b.dataset.k;
    for (const x of $("#fbkind").children) x.setAttribute("aria-checked", x === b) });
  $("#fbform").addEventListener("submit", async e => {
    e.preventDefault(); if (send.disabled) return;
    busy = true; check(); send.textContent = "Sending…"; stat.textContent = ""; stat.classList.remove("bad");
    const body = {kind, msg: msg.value.trim(), contact: $("#fbcontact").value.trim(), website: $("#fbweb").value,
      page: from, ver: document.querySelector(".sitever")?.dataset.ver || ""};
    let err = "";
    try {
      const r = await fetch(API, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
      if (r.status === 429) err = "That's a lot of notes from here today. Please try again later.";
      else if (!r.ok) err = "The server didn't take it (" + r.status + "). Please try again.";
    } catch(x) { err = "Couldn't reach the server. Check your connection" + (D.lazy ? "" : ", or open the site at maplestory.scumlord.studio") + "." }
    busy = false; send.textContent = "Send note";
    if (err){ stat.textContent = err; stat.classList.add("bad"); check(); return }
    msg.value = ""; $("#fbcontact").value = ""; check();
    $("#fbform").hidden = true; $("#fbdone").hidden = false; $("#fbagain").focus();
  });
  $("#fbagain").addEventListener("click", () => { $("#fbdone").hidden = true; $("#fbform").hidden = false; msg.focus() });
  check();

  // owner inbox
  let notes = [], show = "new";
  const key = () => $("#fbkey").value.trim();
  const ago = iso => { const m = (Date.now() - Date.parse(iso)) / 60e3;
    return m < 60 ? Math.max(1, Math.round(m)) + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : new Date(iso).toLocaleDateString(undefined, {month: "short", day: "numeric"}) };
  const draw = () => {
    const open = notes.filter(n => !n.done).length, list = show === "new" ? notes.filter(n => !n.done) : notes;
    $("#fbinfo").textContent = `${fmt(notes.length)} note${notes.length === 1 ? "" : "s"}, ${fmt(open)} new.`;
    $("#fblist").innerHTML = list.length ? list.map(n => `<div class="fbnote${n.done ? " done" : ""}" data-id="${n.id}">
      <div class="fbmeta"><span class="pill fbk">${esc(n.kind)}</span><span title="${esc(n.received)}">${esc(ago(n.received))}</span>${n.page ? `<span>from ${esc(n.page)}</span>` : ""}${n.ver ? `<span>v${esc(n.ver)}</span>` : ""}${n.contact ? `<span class="fbwho">${esc(n.contact)}</span>` : ""}</div>
      <p class="fbtext">${esc(n.msg)}</p>
      <div class="btnrow"><button class="btn sm" type="button" data-act="done">${n.done ? "Mark new" : "Mark read"}</button><button class="btn sm" type="button" data-act="del">Delete</button></div></div>`).join("")
      : `<p class="tiny">${show === "new" ? "No new notes." : "No notes yet."}</p>`;
  };
  const call = (path, opt = {}) => fetch(API + path, {...opt, headers: {...opt.headers, authorization: "Bearer " + key()}});
  const load = async () => {
    if (!key()) return;
    $("#fbinfo").textContent = "Loading…";
    let r; try { r = await call("") } catch(x) { $("#fbinfo").textContent = "Couldn't reach the server."; return }
    if (r.status === 401){ $("#fbinfo").textContent = "Wrong key."; ls("fbkey", null); $("#fbforget").hidden = true; return }
    if (!r.ok){ $("#fbinfo").textContent = r.status === 503 ? "The inbox has no key yet: add the FEEDBACK_KEY repo secret and redeploy the server." : "Server error (" + r.status + ")."; return }
    const j = await r.json().catch(() => ({}));
    notes = Array.isArray(j.notes) ? j.notes.filter(n => n && Number.isInteger(n.id) && typeof n.msg === "string") : [];
    ls("fbkey", key()); $("#fbforget").hidden = false; $("#fbshow").hidden = false; draw();
  };
  $("#fbopen").addEventListener("click", load);
  $("#fbkey").addEventListener("keydown", e => { if (e.key === "Enter") load() });
  $("#fbforget").addEventListener("click", () => { ls("fbkey", null); $("#fbkey").value = ""; notes = []; $("#fblist").innerHTML = "";
    $("#fbinfo").textContent = "Key forgotten on this browser."; $("#fbforget").hidden = true; $("#fbshow").hidden = true });
  $("#fbshow").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (!b) return; show = b.dataset.s;
    for (const x of $("#fbshow").children) x.setAttribute("aria-checked", x === b); draw() });
  $("#fblist").addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const n = notes.find(x => x.id === +b.closest("[data-id]").dataset.id); if (!n) return;
    if (b.dataset.act === "del" && !confirm("Delete this note for good?")) return;
    const body = b.dataset.act === "del" ? {id: n.id, delete: true} : {id: n.id, done: !n.done};
    b.disabled = true;
    try { const r = await call("/done", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)}); if (!r.ok) throw 0 }
    catch(x) { b.disabled = false; $("#fbinfo").textContent = "Couldn't save that change."; return }
    if (body.delete) notes = notes.filter(x => x !== n); else n.done = body.done ? 1 : 0;
    draw();
  });
  const saved = lg("fbkey");
  if (saved){ $("#fbkey").value = saved; $("#fbadmin").addEventListener("toggle", () => { if ($("#fbadmin").open && !notes.length) load() }) }
})();
