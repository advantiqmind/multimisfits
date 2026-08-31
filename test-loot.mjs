import {
  parseBossFilter,
  matchesBoss,
  extractLootData,
} from "./functions/api/loot.js";

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", msg); }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ---- parseBossFilter ---- */

console.log("--- parseBossFilter ---");

assert(parseBossFilter("") === null, "empty string returns null");
assert(parseBossFilter("No boss line here") === null, "no Boss: line returns null");
assert(
  deepEqual(parseBossFilter("Boss: Chambers of Xeric"), ["chambers of xeric"]),
  "single boss parsed lowercase"
);
assert(
  deepEqual(parseBossFilter("Boss: CHAMBERS OF XERIC"), ["chambers of xeric"]),
  "uppercase boss parsed lowercase"
);
assert(
  deepEqual(parseBossFilter("Boss: Chambers of Xeric, Theatre of Blood"), ["chambers of xeric", "theatre of blood"]),
  "multiple bosses parsed"
);
assert(
  deepEqual(parseBossFilter("Boss: Chambers of Xeric , Theatre of Blood , Zulrah"), ["chambers of xeric", "theatre of blood", "zulrah"]),
  "multiple bosses with extra whitespace"
);
assert(parseBossFilter("Boss: any") === null, "Boss: any returns null");
assert(parseBossFilter("Boss: ANY") === null, "Boss: ANY returns null");
assert(parseBossFilter("Boss: Any") === null, "Boss: Any returns null");

assert(
  deepEqual(parseBossFilter("When: Saturday\nBoss: Vorkath\nEnds: Sunday"), ["vorkath"]),
  "Boss line amid other EventForge fields"
);

assert(
  deepEqual(parseBossFilter("boss: General Graardor"), ["general graardor"]),
  "lowercase boss: prefix"
);

/* ---- matchesBoss ---- */

console.log("--- matchesBoss ---");

assert(matchesBoss("Chambers of Xeric", null) === true, "null filter matches everything");
assert(matchesBoss("Zulrah", null) === true, "null filter matches Zulrah");
assert(
  matchesBoss("Chambers of Xeric", ["chambers of xeric"]) === true,
  "exact match (case-insensitive)"
);
assert(
  matchesBoss("CHAMBERS OF XERIC", ["chambers of xeric"]) === true,
  "source uppercase matches lowercase filter"
);
assert(
  matchesBoss("Zulrah", ["chambers of xeric"]) === false,
  "non-matching boss rejected"
);
assert(
  matchesBoss("Chambers of Xeric", ["chambers of xeric", "theatre of blood"]) === true,
  "matches first in multi-boss filter"
);
assert(
  matchesBoss("Theatre of Blood", ["chambers of xeric", "theatre of blood"]) === true,
  "matches second in multi-boss filter"
);
assert(
  matchesBoss("Vorkath", ["chambers of xeric", "theatre of blood"]) === false,
  "non-matching boss in multi-boss filter rejected"
);

/* ---- extractLootData ---- */

console.log("--- extractLootData ---");

assert(extractLootData(null) === null, "null body returns null");
assert(extractLootData({}) === null, "empty body returns null");
assert(extractLootData({ type: "DEATH" }) === null, "non-LOOT type returns null");
assert(extractLootData({ type: "LOOT" }) === null, "LOOT without playerName returns null");
assert(
  extractLootData({ type: "LOOT", playerName: "test", extra: {} }) === null,
  "LOOT without source returns null"
);

var basicPayload = {
  type: "LOOT",
  playerName: "mr flsh",
  extra: {
    source: "Chambers of Xeric",
    killCount: 47,
    items: [
      { name: "Prayer scroll", quantity: 1, price: 48000000 },
      { name: "Torstol seed", quantity: 2, price: 98000 },
      { name: "Rune arrow", quantity: 150, price: 3000 },
    ],
  },
};

var result = extractLootData(basicPayload);
assert(result !== null, "valid payload returns data");
assert(result.player === "mr flsh", "player extracted");
assert(result.source === "Chambers of Xeric", "source extracted");
assert(result.killCount === 47, "killCount extracted");
assert(result.items.length === 3, "3 items extracted");
assert(result.totalValue === 48101000, "totalValue = 48000000 + 98000 + 3000");

var priceEachPayload = {
  type: "LOOT",
  playerName: "Koi",
  extra: {
    source: "Zulrah",
    items: [
      { name: "Tanzanite fang", quantity: 1, priceEach: 4500000 },
      { name: "Snakeskin", quantity: 35, priceEach: 500 },
    ],
  },
};

var result2 = extractLootData(priceEachPayload);
assert(result2 !== null, "priceEach payload returns data");
assert(result2.player === "Koi", "player from priceEach payload");
assert(result2.killCount === 0, "missing killCount defaults to 0");
assert(result2.items[0].price === 4500000, "priceEach * quantity for qty 1");
assert(result2.items[1].price === 17500, "priceEach * quantity for qty 35");
assert(result2.totalValue === 4517500, "totalValue with priceEach");

var emptyItems = {
  type: "LOOT",
  playerName: "test",
  extra: { source: "Goblin", items: [] },
};

var result3 = extractLootData(emptyItems);
assert(result3 !== null, "empty items valid");
assert(result3.totalValue === 0, "empty items totalValue = 0");
assert(result3.items.length === 0, "empty items array");

var noItems = {
  type: "LOOT",
  playerName: "test",
  extra: { source: "Goblin" },
};

var result4 = extractLootData(noItems);
assert(result4 !== null, "missing items valid");
assert(result4.totalValue === 0, "missing items totalValue = 0");
assert(result4.items.length === 0, "missing items defaults to empty");

var mixedPrice = {
  type: "LOOT",
  playerName: "test",
  extra: {
    source: "Test",
    items: [
      { name: "A", quantity: 1, price: 100, priceEach: 100 },
      { name: "B", quantity: 5, priceEach: 20 },
      { name: "C", quantity: 1, price: 500 },
    ],
  },
};

var result5 = extractLootData(mixedPrice);
assert(result5.items[0].price === 100, "price takes precedence over priceEach");
assert(result5.items[1].price === 100, "priceEach * quantity when no price");
assert(result5.items[2].price === 500, "price used directly");
assert(result5.totalValue === 700, "mixed price totalValue");

/* ---- parseBossFilter edge cases ---- */

console.log("--- parseBossFilter edge cases ---");

assert(
  deepEqual(parseBossFilter("Boss:Vorkath"), ["vorkath"]),
  "no space after colon"
);

assert(
  deepEqual(parseBossFilter("Boss:   Nex  "), ["nex"]),
  "extra whitespace trimmed"
);

assert(parseBossFilter("Boss: ") === null || deepEqual(parseBossFilter("Boss: "), []),
  "Boss with only whitespace"
);

assert(
  deepEqual(parseBossFilter("Boss: The Gauntlet"), ["the gauntlet"]),
  "boss with 'The' prefix"
);

assert(
  deepEqual(parseBossFilter("Boss: The Corrupted Gauntlet"), ["the corrupted gauntlet"]),
  "multi-word boss"
);

/* ---- summary ---- */

console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);
if (fail > 0) process.exit(1);
