/* The List: known kill-stealers, as reported by Danny. Add new entries to the top of KSERS.
   Fields: name, level, job, guild ("" = none), fame, note, added (YYYY-MM-DD). Only what was seen in-game. */
const KSERS = [
  {name: "EllieFlower", level: 18, job: "Magician", guild: "", fame: 0, note: "Intentionally camps melee classes to steal their kills.", added: "2026-10-07"},
];

const renderKs = () => {
  const q = $("#kssearch").value.trim().toLowerCase();
  const rows = KSERS.filter(k => !q || [k.name, k.job, k.guild, k.note].join(" ").toLowerCase().includes(q));
  $("#ksrows").innerHTML = rows.map(k => `<tr><td><b>${esc(k.name)}</b></td><td class="num">${k.level ?? "?"}</td><td>${esc(k.job || "?")}</td>
    <td>${k.guild ? esc(k.guild) : "none"}</td><td class="num">${k.fame ?? "?"}</td><td>${esc(k.note)}</td><td>${esc(k.added)}</td></tr>`).join("")
    || `<tr><td colspan="7">No match.</td></tr>`;
  $("#kscount").textContent = `${rows.length} of ${KSERS.length}`;
};
$("#kssearch").addEventListener("input", renderKs);
renderKs();
