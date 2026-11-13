import test from "node:test";
import assert from "node:assert/strict";
import { build, search, analyze } from "../core.js";
function order(chars, a, b) {
  while (a < chars.length && b < chars.length) {
    const d = chars[a++].codePointAt(0) - chars[b++].codePointAt(0);
    if (d) return d;
  }
  return chars.length - a - (chars.length - b);
}
test("banana suffixes, LCP, distinct substrings and overlaps", () => {
  const b = build("banana");
  assert.deepEqual(b.sa, [5, 3, 1, 0, 4, 2]);
  assert.deepEqual(b.lcp, [0, 1, 3, 0, 0, 2]);
  assert.equal(b.distinct, 15);
  assert.deepEqual(b.longest, [{ text: "ana", length: 3, positions: [1, 3] }]);
  assert.deepEqual(search(b, "ana").positions, [1, 3]);
  assert.deepEqual(search(b, "bananas").positions, []);
});
test("Unicode positions and numeric code-point collation", () => {
  const b = build("😀\ue000😀a");
  assert.deepEqual(b.sa, [3, 1, 2, 0]);
  assert.deepEqual(search(b, "😀").positions, [0, 2]);
  assert.equal(b.distinct, 9);
});
test("all longest ties are returned, including overlap", () => {
  assert.deepEqual(
    build("abXabYcdZcd").longest.map((x) => x.text),
    ["ab", "cd"],
  );
  assert.deepEqual(build("aaaaa").longest, [
    { text: "aaaa", length: 4, positions: [0, 1] },
  ]);
});
test("400 random texts match exhaustive suffix, substring and occurrence oracles", () => {
  let state = 73;
  const rnd = (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
  const alphabet = ["a", "b", "c", "😀", "\ue000", "\n"];
  for (let run = 0; run < 400; run++) {
    const chars = Array.from(
        { length: rnd(25) },
        () => alphabet[rnd(alphabet.length)],
      ),
      b = build(chars.join(""));
    assert.deepEqual(
      b.sa,
      chars.map((_, i) => i).sort((a, c) => order(chars, a, c)),
    );
    const all = new Map();
    for (let i = 0; i < chars.length; i++)
      for (let j = i + 1; j <= chars.length; j++) {
        const key = chars.slice(i, j).join("");
        if (!all.has(key)) all.set(key, []);
        all.get(key).push(i);
      }
    assert.equal(b.distinct, all.size);
    let max = 0;
    for (const [s, p] of all)
      if (p.length > 1) max = Math.max(max, Array.from(s).length);
    const expected = [...all]
      .filter(([s, p]) => p.length > 1 && Array.from(s).length === max)
      .map(([text, positions]) => ({ text, positions, length: max }));
    assert.deepEqual(
      [...b.longest].sort((a, c) => a.text.localeCompare(c.text)),
      expected.sort((a, c) => a.text.localeCompare(c.text)),
    );
    b.lcp.forEach((v, i) => {
      let l = 0;
      if (i)
        while (
          chars[b.sa[i] + l] !== undefined &&
          chars[b.sa[i] + l] === chars[b.sa[i - 1] + l]
        )
          l++;
      assert.equal(v, l);
    });
    for (let q = 0; q < 10; q++) {
      const query = Array.from(
        { length: 1 + rnd(4) },
        () => alphabet[rnd(alphabet.length)],
      ).join("");
      assert.deepEqual(search(b, query).positions, all.get(query) || []);
    }
  }
});
test("construction rounds rank exactly their doubled prefixes", () => {
  const b = build("mississippi");
  for (const r of b.rounds) {
    const seen = new Map();
    for (const p of r.order) {
      const key = b.chars.slice(p, p + 2 * r.width).join("");
      if (!seen.has(key)) seen.set(key, seen.size);
      assert.equal(r.ranks[p], seen.get(key));
    }
    assert.equal(r.classes, seen.size);
  }
});
test("empty text, maximum repeated text and query limits", () => {
  assert.deepEqual(search(build(""), "a").positions, []);
  assert.equal(build("").distinct, 0);
  const b = build("a".repeat(12000));
  assert.equal(b.distinct, 12000);
  assert.equal(b.longest[0].length, 11999);
  assert.equal(search(b, "a".repeat(256)).positions.length, 11745);
  assert.throws(() => build("a".repeat(12001)));
  assert.throws(() => build("\ud800"));
  assert.throws(() => search(b, ""));
  assert.throws(() => search(b, "a".repeat(257)));
  assert.throws(() => analyze({ text: "a", query: "a", extra: 1 }));
});
