// Two recorded trees of one fight: every turn both recorded, compared child for child (fork points by hash).
// usage: node compare-trees.ts <tree-a> <tree-b>
import { Tree } from "./tree.ts";

const [a, b] = process.argv.slice(2).map(dir => new Tree(dir));
let both = 0;
let same = 0;
const differ: string[] = [];
const bKeys = new Map(b.entries());
for (const [k, children] of a.entries()) {
  const other = bKeys.get(k);
  if (!other) continue;
  both++;
  if (JSON.stringify(children) === JSON.stringify(other)) same++;
  else differ.push(k);
}
console.log(JSON.stringify({ a: a.size, b: b.size, both, same, differ: differ.length, firstDiffer: differ.slice(0, 5) }));
