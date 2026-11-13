export function characters(text, limit, label) {
  if (typeof text !== "string" || text.length > limit * 2)
    throw Error(`${label} is too long.`);
  const chars = Array.from(text);
  if (
    chars.length > limit ||
    chars.some((c) => {
      const n = c.codePointAt(0);
      return n >= 0xd800 && n <= 0xdfff;
    })
  )
    throw Error(
      `${label} must contain at most ${limit} valid Unicode code points.`,
    );
  return chars;
}
export function build(text) {
  const chars = characters(text, 12000, "Text"),
    n = chars.length;
  let sa = Array.from({ length: n }, (_, i) => i),
    rank = chars.map((c) => c.codePointAt(0));
  const rounds = [];
  for (let width = 1; width < n; width *= 2) {
    const second = (i) => (i + width < n ? rank[i + width] : -1);
    sa.sort((a, b) => rank[a] - rank[b] || second(a) - second(b));
    const next = Array(n).fill(0);
    for (let i = 1; i < n; i++)
      next[sa[i]] =
        next[sa[i - 1]] +
        +(
          rank[sa[i]] !== rank[sa[i - 1]] || second(sa[i]) !== second(sa[i - 1])
        );
    rank = next;
    rounds.push({
      width,
      classes: rank[sa[n - 1]] + 1,
      order: [...sa],
      ranks: [...rank],
    });
    if (rank[sa[n - 1]] === n - 1) break;
  }
  const inverse = Array(n),
    lcp = Array(n).fill(0);
  sa.forEach((p, i) => (inverse[p] = i));
  let h = 0;
  for (let p = 0; p < n; p++) {
    const r = inverse[p];
    if (!r) {
      h = 0;
      continue;
    }
    const q = sa[r - 1];
    while (p + h < n && q + h < n && chars[p + h] === chars[q + h]) h++;
    lcp[r] = h;
    if (h) h--;
  }
  const max = lcp.reduce((a, b) => Math.max(a, b), 0),
    groups = [];
  if (max)
    for (let i = 1; i < n; i++)
      if (lcp[i] === max) {
        const start = i - 1;
        while (i + 1 < n && lcp[i + 1] === max) i++;
        const positions = sa.slice(start, i + 1).sort((a, b) => a - b);
        groups.push({
          text: chars.slice(sa[start], sa[start] + max).join(""),
          length: max,
          positions,
        });
      }
  return {
    text,
    chars,
    sa,
    lcp,
    rounds,
    distinct: (n * (n + 1)) / 2 - lcp.reduce((a, b) => a + b, 0),
    longest: groups,
  };
}
export function search(index, query) {
  const pattern = characters(query, 256, "Query");
  if (!pattern.length) throw Error("Enter a nonempty query.");
  const trace = [];
  function compare(position) {
    let i = 0;
    while (i < pattern.length && position + i < index.chars.length) {
      const delta =
        index.chars[position + i].codePointAt(0) - pattern[i].codePointAt(0);
      if (delta) return { comparison: Math.sign(delta), compared: i + 1 };
      i++;
    }
    return { comparison: i === pattern.length ? 0 : -1, compared: i };
  }
  function bound(upper) {
    let lo = 0,
      hi = index.sa.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2),
        c = compare(index.sa[mid]);
      trace.push({
        bound: upper ? "upper" : "lower",
        lo,
        hi,
        mid,
        position: index.sa[mid],
        ...c,
      });
      if (c.comparison < 0 || (upper && c.comparison === 0)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  const lower = bound(false),
    upper = bound(true);
  return {
    query,
    length: pattern.length,
    lower,
    upper,
    positions: index.sa.slice(lower, upper).sort((a, b) => a - b),
    trace,
  };
}
export function analyze(model) {
  if (
    !model ||
    typeof model !== "object" ||
    Object.keys(model).sort().join(",") !== "query,text"
  )
    throw Error("A study must contain exactly text and query.");
  const index = build(model.text),
    match = search(index, model.query);
  return {
    format: "suffix-folio-evidence-v1",
    model: { ...model },
    index,
    match,
  };
}
export function example() {
  return {
    text: "the quiet river carries a letter.\nthe quiet river carries a lantern.\na letter returns with the river.\n",
    query: "river",
  };
}
