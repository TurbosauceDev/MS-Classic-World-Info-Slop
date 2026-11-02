/* core/questlog.js — the Quests card's state (P1-7): what the QUEST window reads become. Pure, Node-tested; the
   pixels live in app/questread.js (the site's Quest log engine, shared) and the UI in renderer-quests.js.

   createState() -> {prog: {id: ln}, done: [id], unsure: [], at, cats}
   apply(res, st) -> {progN, doneN, added}  merge one settle() result: in-progress replaces (the window is the truth),
                     done accumulates (a Completed-tab read adds to it), unsure replaces. Returns the counts for the
                     run-log note. Callers validate ids against QuestRead's BYID before showing or syncing. */
(function (root){
  function createState(){ return {prog: {}, done: [], unsure: [], at: null, cats: null} }
  function apply(res, st){
    const before = Object.keys(st.prog).length;
    st.prog = {};
    for (const [id, ln] of Object.entries(res.prog || {})) st.prog[String(id)] = ln;
    for (const id of res.done || []) if (!st.done.includes(String(id))) st.done.push(String(id));
    st.unsure = (res.unsure || []).slice(0, 8);
    st.at = res.at || new Date().toISOString();
    st.cats = res.cats || st.cats;
    return {progN: Object.keys(st.prog).length, doneN: st.done.length, added: Object.keys(st.prog).length - before};
  }
  const api = {createState, apply};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GrindQuestLog = api;
})(typeof self !== "undefined" ? self : this);
