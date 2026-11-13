import {
  parseBossFilter,
  matchesBoss,
  extractLootData,
  parseEventDateField,
  parsePointsConfig,
  scoreDropPoints,
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

assert(
  deepEqual(parseBossFilter("**Boss:** Phosani's Nightmare"), ["phosani's nightmare"]),
  "bold label: **Boss:** value"
);

assert(
  deepEqual(parseBossFilter("**Boss: Phosani's Nightmare**"), ["phosani's nightmare"]),
  "fully bold: **Boss: value**"
);

assert(
  deepEqual(parseBossFilter("some text\n**Boss:** Vorkath, Zulrah\nmore text"), ["vorkath", "zulrah"]),
  "bold Boss amid other content with multiple bosses"
);

assert(
  parseBossFilter("**Boss: any**") === null,
  "bold Boss: any returns null"
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

assert(
  matchesBoss("Tombs of Amascut: Expert Mode", ["tombs of amascut"]) === true,
  "partial match: Expert Mode matches base name"
);
assert(
  matchesBoss("Chambers of Xeric: Challenge Mode", ["chambers of xeric"]) === true,
  "partial match: Challenge Mode matches base name"
);
assert(
  matchesBoss("Theatre of Blood: Hard Mode", ["theatre of blood"]) === true,
  "partial match: Hard Mode matches base name"
);
assert(
  matchesBoss("Tombs of Amascut: Expert Mode", ["tombs of amascut", "chambers of xeric"]) === true,
  "partial match works in multi-boss filter"
);
assert(
  matchesBoss("Zulrah", ["tombs of amascut"]) === false,
  "partial match does not false-positive on unrelated boss"
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

/* ---- parseEventDateField ---- */

console.log("--- parseEventDateField ---");

assert(parseEventDateField("", "When") === null, "empty string returns null");
assert(parseEventDateField("No date here", "When") === null, "no When: line returns null");

var discordTs = parseEventDateField("When: <t:1724871600:F>", "When");
assert(discordTs !== null, "Discord timestamp parsed");
assert(discordTs === new Date(1724871600 * 1000).toISOString(), "Discord timestamp value correct");

var discordTsNoFormat = parseEventDateField("Ends: <t:1724871600>", "Ends?");
assert(discordTsNoFormat !== null, "Discord timestamp without format code parsed");

var endsMatch = parseEventDateField("When: something\nEnds: <t:1726012740:F>", "Ends?");
assert(endsMatch !== null, "Ends: line parsed from multi-line content");

assert(parseEventDateField("When: in 2 days", "When") === null, "relative 'in X days' skipped");

var plainDate = parseEventDateField("When: September 20, 2026 9:00 PM", "When");
assert(plainDate !== null, "plain text date parsed");

/* ---- parsePointsConfig ---- */

console.log("--- parsePointsConfig ---");

assert(parsePointsConfig("") === null, "empty string returns null");
assert(parsePointsConfig("No points line here") === null, "no Points: line returns null");

var gwdConfig = parsePointsConfig("Points: gwd");
assert(gwdConfig !== null, "gwd preset parsed");
assert(gwdConfig.preset === "gwd", "preset name is gwd");
assert(gwdConfig.items["bandos chestplate"] === 4, "BCP is 4 points");
assert(gwdConfig.items["armadyl hilt"] === 5, "Armadyl hilt is 5 points");
assert(gwdConfig.items["pet general graardor"] === 10, "Graardor pet is 10 points");
assert(gwdConfig.items["godsword shard 1"] === 1, "Godsword shard is 1 point");
assert(gwdConfig.items["staff of the dead"] === 2, "Staff of the dead is 2 points");

var gwdUpper = parsePointsConfig("Points: GWD");
assert(gwdUpper !== null, "GWD uppercase parsed");
assert(gwdUpper.preset === "gwd", "uppercase maps to gwd preset");

var boldPoints = parsePointsConfig("**Points:** gwd");
assert(boldPoints !== null, "bold Points: parsed");
assert(boldPoints.preset === "gwd", "bold Points maps to gwd");

var boldFull = parsePointsConfig("**Points: gwd**");
assert(boldFull !== null, "fully bold Points: parsed");
assert(boldFull.preset === "gwd", "fully bold maps to gwd");

assert(parsePointsConfig("Points: unknown") === null, "unknown preset returns null");
assert(parsePointsConfig("Points: ") === null, "empty value returns null");

var multiLine = parsePointsConfig("Boss: General Graardor\nPoints: gwd\nEnds: Sunday");
assert(multiLine !== null, "Points amid other lines");
assert(multiLine.preset === "gwd", "multi-line returns gwd");

var noSpace = parsePointsConfig("Points:gwd");
assert(noSpace !== null, "no space after colon");
assert(noSpace.preset === "gwd", "no space still parses");

var lowercasePrefix = parsePointsConfig("points: gwd");
assert(lowercasePrefix !== null, "lowercase points: parsed");

/* ---- scoreDropPoints ---- */

console.log("--- scoreDropPoints ---");

var pointsCfg = parsePointsConfig("Points: gwd");

var result6 = scoreDropPoints([], pointsCfg);
assert(result6.totalPoints === 0, "empty items = 0 points");
assert(result6.scoredItems.length === 0, "empty items = no scored items");

var result7 = scoreDropPoints([
  { name: "Bandos chestplate", quantity: 1, price: 10000000 },
], pointsCfg);
assert(result7.totalPoints === 4, "BCP = 4 points (case-insensitive)");
assert(result7.scoredItems.length === 1, "one scored item");
assert(result7.scoredItems[0].earned === 4, "BCP earned = 4");

var result8 = scoreDropPoints([
  { name: "Bandos chestplate", quantity: 1, price: 10000000 },
  { name: "Godsword shard 1", quantity: 1, price: 500000 },
  { name: "Coins", quantity: 20000, price: 20000 },
], pointsCfg);
assert(result8.totalPoints === 5, "BCP(4) + shard(1) = 5, coins unscored");
assert(result8.scoredItems.length === 2, "two scored items, coins excluded");

var result9 = scoreDropPoints([
  { name: "Godsword shard 2", quantity: 3, price: 1500000 },
], pointsCfg);
assert(result9.totalPoints === 3, "3x shard = 3 points");

var result10 = scoreDropPoints([
  { name: "Dragon bones", quantity: 1, price: 3000 },
], pointsCfg);
assert(result10.totalPoints === 0, "non-preset item = 0 points");
assert(result10.scoredItems.length === 0, "non-preset = no scored items");

var nullResult = scoreDropPoints([{ name: "test", quantity: 1, price: 100 }], null);
assert(nullResult.totalPoints === 0, "null config = 0 points");

/* ---- summary ---- */

console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);
if (fail > 0) process.exit(1);
