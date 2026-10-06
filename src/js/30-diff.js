/* diffs */
function cell(pair, higherIsGood){
  if (!pair) return "–";
  const [o, n] = pair;
  if (o == null && n == null) return "–";
  if (o === n || o == null) return fmt(n);
  const up = n > o, cls = higherIsGood == null ? "" : (up === higherIsGood ? "up" : "down");
  return `<span class="sub">${fmt(o)} →</span> <span class="${cls}">${fmt(n)}</span>`;
}
const CLASS_TREE = {Warrior:["Warrior","Fighter","Page","Spearman"], Magician:["Magician","F/P Wizard","I/L Wizard","Cleric"],
  Bowman:["Archer","Hunter","Crossbowman"], Thief:["Rogue","Assassin","Bandit"], Beginner:["Beginner"]};
const CLASS_ORDER = ["Warrior","Magician","Bowman","Thief","Beginner"];
let currentClass = "all";
try { currentClass = localStorage.getItem("cls-seg") || "all" } catch(e) {}
document.querySelectorAll("#classseg button").forEach(b => {
  b.setAttribute("aria-checked", b.dataset.c === currentClass);
  b.addEventListener("click", () => {
    currentClass = b.dataset.c;
    document.querySelectorAll("#classseg button").forEach(x => x.setAttribute("aria-checked", x === b));
    try { localStorage.setItem("cls-seg", currentClass) } catch(e) {}
    renderDiff();
  });
});
function renderDiff(){
  const s = $("#dsearch").value.trim().toLowerCase();
  const md = D.mobdiff.filter(r => !D.latermobnames.includes(r[0]) && (!s || r[0].toLowerCase().includes(s)));
  $("#mrows").innerHTML = md.map(([nm, lv, d]) => d ? `<tr><td class="name">${esc(nm)}</td>
    <td class="num">${cell(d.level)}</td><td class="num">${cell(d.hp)}</td><td class="num">${cell(d.exp, true)}</td>
    <td class="num">${cell(d.acc)}</td><td class="num">${cell(d.eva, false)}</td><td class="num">${cell(d.PDDamage, false)}</td><td class="num">${cell(d.MDDamage, false)}</td></tr>`
    : `<tr><td class="name">${esc(nm)} <span class="pill p-hot">new</span></td><td class="num">${lv}</td><td colspan="6" class="sub">Not in the 2008 client</td></tr>`).join("");
  const mon = currentClass === "monsters";
  $("#skillsec").hidden = mon; $("#monsec").hidden = !mon; $("#donlywrap").hidden = mon;
  if (mon) return;
  const groups = currentClass === "all" ? CLASS_ORDER : [currentClass];
  const html = groups.map(g => {
    const branches = CLASS_TREE[g];
    let total = 0, changed = 0;
    const body = branches.map(br => {
      const rows = D.skilldiff.filter(r => r[0] === br && (!$("#donly").checked || r[7]) && (!s || r[2].toLowerCase().includes(s)));
      const all = D.skilldiff.filter(r => r[0] === br); total += all.length; changed += all.filter(r => r[7]).length;
      if (!rows.length) return "";
      return `<tr class="branch"><td colspan="4">${esc(br)} · ${esc(rows[0][1])}</td></tr>` + rows.map(([c, j, n, o, cur, oml, cml]) => `<tr>
        <td class="name">${esc(n)}${o == null ? ' <span class="pill p-hot">new</span>' : ""}</td>
        <td class="num">${oml != null && oml !== cml ? `<span class="sub">${oml} →</span> ${cml}` : cml}</td>
        <td class="sub">${esc(o ?? "Not in 2008 at this job")}</td><td>${esc(cur)}</td></tr>`).join("");
    }).join("");
    return `<div class="cgroup"><h3>${esc(g)}<span>${changed} of ${total} skills changed</span></h3>` + (body
      ? `<div class="tblwrap"><table><thead><tr><th>Skill</th><th class="num">Max lv</th><th>2008 (v49)</th><th>Classic (COT2)</th></tr></thead><tbody>${body}</tbody></table></div>`
      : `<p class="note">No skills match the search.</p>`) + `</div>`;
  }).join("");
  $("#skillgroups").innerHTML = html;
  $("#skillhead").textContent = currentClass === "all" ? "Skills by class" : `${currentClass} skills`;
}
["#dsearch","#donly"].forEach(s => $(s).addEventListener("input", renderDiff));
renderDiff();

/* headline facts for the diff tab */
(() => {
  const MD = D.mobdiff.filter(r => !D.latermobnames.includes(r[0]));
  const withOld = MD.filter(r => r[2]);
  const expUp = withOld.filter(r => r[2].exp[1] > r[2].exp[0]).length, expDown = withOld.filter(r => r[2].exp[1] < r[2].exp[0]).length;
  const accUp = withOld.filter(r => r[2].acc[1] > r[2].acc[0]).length;
  const newM = MD.filter(r => !r[2]).length;
  const sk = D.skilldiff, ch = sk.filter(r => r[7]).length, nw = sk.filter(r => r[3] == null).length;
  const facts = [
    [`${ch} of ${sk.length} skills changed`, `${nw} are new to their job compared with 2008, including mobility skills like Rush and moved skills.`],
    [`${expUp} monsters give more EXP, ${expDown} give less`, `Out of ${withOld.length} launch-area monsters that also exist in the 2008 client.`],
    [`${accUp} monsters hit more accurately`, `Monster accuracy went up across the board, so evasion builds are weaker than you remember.`],
    [`${newM} monsters are new`, `Monsters in the launch areas with no 2008 counterpart.`]
  ];
  $("#difffacts").innerHTML = facts.map(([h,p]) => `<div class="fact"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("");
})();

