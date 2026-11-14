import { example } from "./core.js";
const $ = (id) => document.getElementById(id),
  worker = new Worker("/worker.js", { type: "module" });
let result,
  sequence = 0,
  page = 0,
  ready = false;
function el(tag, text) {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
function message(text, error = false) {
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
}
function stale() {
  ready = false;
  $("evidence").disabled = $("csv").disabled = true;
  message("Inputs changed. Build & search to update results.");
}
function run(model) {
  ready = false;
  $("evidence").disabled = $("csv").disabled = true;
  worker.postMessage({ id: ++sequence, model });
  message("Ordering suffixes and measuring common prefixes…");
}
function set(model) {
  $("text").value = model.text;
  $("query").value = model.query;
  run(model);
}
function table() {
  if (!result) return;
  const b = result.index,
    stage = $("stage").value,
    round = stage === "final" ? null : b.rounds[Number(stage)],
    order = round ? round.order : b.sa;
  page = Math.max(
    0,
    Math.min(page, Math.max(0, Math.ceil(order.length / 30) - 1)),
  );
  $("pagination").textContent =
    `${page + 1} / ${Math.max(1, Math.ceil(order.length / 30))}`;
  $("previous").disabled = page === 0;
  $("next").disabled = (page + 1) * 30 >= order.length;
  $("value-heading").textContent = round ? "Rank" : "LCP";
  $("round-note").textContent = round
    ? `Prefixes up to ${round.width * 2} code points · ${round.classes} equivalence classes. Equal ranks may still be unresolved.`
    : "Final lexicographic order. LCP compares each suffix with the preceding row.";
  $("suffixes").replaceChildren(
    ...order.slice(page * 30, page * 30 + 30).map((p, j) => {
      const i = page * 30 + j,
        tr = el("tr", "");
      if (!round && i >= result.match.lower && i < result.match.upper)
        tr.className = "match";
      for (const value of [
        i,
        p,
        round ? round.ranks[p] : b.lcp[i],
        b.chars
          .slice(p, p + 70)
          .join("")
          .replaceAll("\n", "↵")
          .replaceAll("\t", "⇥") + (b.chars.length - p > 70 ? "…" : ""),
      ])
        tr.append(el("td", String(value)));
      return tr;
    }),
  );
}
function render() {
  const b = result.index,
    m = result.match;
  $("metrics").replaceChildren(
    ...[
      ["Code points", b.chars.length],
      ["Distinct substrings", b.distinct],
      ["Query matches", m.positions.length],
      ["Longest repeat", b.longest[0]?.length || 0],
    ].map(([name, value]) => {
      const p = el("p", name);
      p.prepend(el("b", value.toLocaleString()));
      return p;
    }),
  );
  $("matches").textContent =
    `${m.positions.length} occurrence${m.positions.length === 1 ? "" : "s"}`;
  const diff = Array(b.chars.length + 1).fill(0);
  for (const p of m.positions) {
    diff[p]++;
    diff[p + m.length]--;
  }
  const canvas = $("match-map"),
    ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 900, 30);
  ctx.fillStyle = "#ede5d6";
  ctx.fillRect(0, 0, 900, 30);
  ctx.fillStyle = "#b89543";
  for (const p of m.positions)
    ctx.fillRect(
      (900 * p) / Math.max(1, b.chars.length),
      0,
      Math.max(1, (900 * m.length) / Math.max(1, b.chars.length)),
      30,
    );
  canvas.setAttribute(
    "aria-label",
    `${m.positions.length} matches across ${b.chars.length} Unicode code points`,
  );
  $("map-end").textContent = `${b.chars.length} code points`;
  $("selected-occurrence").textContent = "";
  const parts = [];
  let bufferStart = 0;
  function part(text, highlighted, end) {
    const node = el(highlighted ? "mark" : "span", text);
    node.dataset.start = bufferStart;
    node.dataset.end = end;
    bufferStart = end;
    return node;
  }
  let active = 0,
    buffer = "",
    highlight = false;
  for (let i = 0; i < b.chars.length; i++) {
    active += diff[i];
    const h = active > 0;
    if (h !== highlight && buffer) {
      parts.push(part(buffer, highlight, i));
      buffer = "";
    }
    highlight = h;
    buffer += b.chars[i];
  }
  if (buffer) parts.push(part(buffer, highlight, b.chars.length));
  $("passage").replaceChildren(...parts);
  if (!parts.length) $("passage").textContent = "Empty source text.";
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    $("passage").animate([{ opacity: 0.45 }, { opacity: 1 }], {
      duration: 300,
      easing: "ease-out",
    });
  $("occurrences").replaceChildren(
    ...m.positions.slice(0, 200).map((p) => {
      const button = el("button", `@ ${p}`);
      button.type = "button";
      button.setAttribute("aria-label", `Inspect match at code point ${p}`);
      button.onclick = () => {
        for (const mark of $("passage").querySelectorAll("mark")) {
          const active =
            p >= Number(mark.dataset.start) && p < Number(mark.dataset.end);
          mark.classList.toggle("current-match", active);
          if (active)
            mark.scrollIntoView({
              block: "nearest",
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            });
        }
        $("selected-occurrence").textContent =
          `Match at code points ${p}–${p + m.length - 1}. Highlighted regions combine overlapping matches.`;
      };
      return button;
    }),
  );
  if (m.positions.length > 200)
    $("occurrences").append(
      el("span", `${m.positions.length - 200} more in evidence`),
    );
  $("repeats").replaceChildren(
    ...b.longest.slice(0, 50).map((r) => {
      const d = el("div", "");
      d.className = "repeat";
      d.append(
        el("code", r.text),
        el(
          "p",
          `${r.length} code points · ${r.positions.length} occurrences · positions ${r.positions.slice(0, 40).join(", ")}${r.positions.length > 40 ? " …" : ""}`,
        ),
      );
      return d;
    }),
  );
  if (!b.longest.length)
    $("repeats").append(el("p", "No nonempty repeated substring."));
  if (b.longest.length > 50)
    $("repeats").append(
      el("p", `${b.longest.length - 50} more ties in evidence.`),
    );
  $("stage").replaceChildren(
    ...[
      ...b.rounds.map((r, i) => [String(i), `Prefix length ${2 * r.width}`]),
      ["final", "Final suffix array + LCP"],
    ].map(([value, name]) => {
      const o = el("option", name);
      o.value = value;
      return o;
    }),
  );
  $("stage").value = "final";
  page = 0;
  table();
  $("bounds").textContent =
    `Matching interval [${m.lower}, ${m.upper}) · ${m.trace.length} suffix comparisons`;
  $("trace").replaceChildren(
    ...m.trace.map((t) => {
      const tr = el("tr", "");
      for (const v of [t.bound, t.lo, t.hi, t.mid, t.position, t.comparison])
        tr.append(el("td", String(v)));
      return tr;
    }),
  );
}
worker.onmessage = ({ data }) => {
  if (data.id !== sequence) return;
  if (data.error) {
    message(data.error, true);
    return;
  }
  result = data.result;
  ready = true;
  $("evidence").disabled = $("csv").disabled = false;
  render();
  message(
    "Index ready. Search positions and repeated passages refer to the applied source text.",
  );
};
worker.onerror = () => message("Index worker failed. Reload to restart.", true);
$("study").onsubmit = (e) => {
  e.preventDefault();
  run({ text: $("text").value, query: $("query").value });
};
for (const id of ["text", "query"])
  $(id).oninput = () => {
    sequence++;
    stale();
  };
$("example").onclick = () => set(example());
$("stage").onchange = () => {
  page = 0;
  table();
};
$("previous").onclick = () => {
  page--;
  table();
};
$("next").onclick = () => {
  page++;
  table();
};
function download(name, data, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("save").onclick = () =>
  download(
    "suffix-folio-study.json",
    JSON.stringify(
      ready ? result.model : { text: $("text").value, query: $("query").value },
      null,
      2,
    ) + "\n",
  );
$("evidence").onclick = () => {
  if (ready)
    download(
      "suffix-folio-evidence.json",
      JSON.stringify(result, null, 2) + "\n",
    );
};
$("csv").onclick = () => {
  if (!ready) return;
  const b = result.index;
  download(
    "suffix-folio-index.csv",
    "rank,position,lcp,query_match\n" +
      b.sa
        .map((p, i) =>
          [
            i,
            p,
            b.lcp[i],
            i >= result.match.lower && i < result.match.upper,
          ].join(","),
        )
        .join("\n") +
      "\n",
    "text/csv",
  );
};
$("open").onclick = () => $("file").click();
$("file").onchange = async () => {
  const file = $("file").files[0];
  $("file").value = "";
  if (!file) return;
  try {
    if (file.size > 200000) throw Error("Study must be at most 200 KB.");
    const model = JSON.parse(await file.text());
    if (
      !model ||
      Object.keys(model).sort().join(",") !== "query,text" ||
      typeof model.text !== "string" ||
      typeof model.query !== "string"
    )
      throw Error("Use a study with text and query strings.");
    set(model);
  } catch (error) {
    message(error.message, true);
  }
};
set(example());
