import { transformMessages, parseDinkMessage } from "./functions/api/achievements.js";

// Old-format messages (non-Dink embeds + plain content)
const messages = [
  {
    id: "1", timestamp: "2026-08-23T10:00:00Z",
    content: "",
    embeds: [{
      title: "Fe Misfit received a drop: Twisted bow",
      description: "Chambers of Xeric — 412 KC",
      author: { name: "Fe Misfit" },
    }],
  },
  {
    id: "2", timestamp: "2026-08-23T09:00:00Z",
    content: "",
    embeds: [{
      title: "Pet drop!",
      description: "BankStanding has received the Olmlet pet at 156 KC",
      author: { name: "BankStanding" },
    }],
  },
  {
    id: "3", timestamp: "2026-08-23T08:00:00Z",
    content: "SkillerNoPk has achieved 200M Fishing XP!",
    embeds: [],
  },
  {
    id: "4", timestamp: "2026-08-23T07:00:00Z",
    content: "",
    embeds: [{
      title: "Combat Achievement completed",
      description: "Twisted Andy completed a hard combat task",
      author: { name: "Twisted Andy" },
    }],
  },
  {
    id: "5", timestamp: "2026-08-23T06:00:00Z",
    content: "Vilence earned a new personal best at Theatre of Blood: 22:31",
    embeds: [],
  },
  {
    id: "6", timestamp: "2026-08-23T05:00:00Z",
    content: "",
    embeds: [],
  },
];

// Dink-format messages (real Dink plugin embeds with markdown links + fields)
const dinkMessages = [
  {
    id: "d1", timestamp: "2026-08-23T04:00:00Z",
    content: "",
    embeds: [{
      title: "Level Up",
      description: "StWidu93 has levelled [Magic](https://oldschool.runescape.wiki/w/Magic) to 97",
      author: { name: "StWidu93" },
    }],
  },
  {
    id: "d2", timestamp: "2026-08-23T03:00:00Z",
    content: "",
    embeds: [{
      title: "Loot Drop",
      description: "StWidu93 has looted:\n\n23 x [Battlestaff](https://prices.runescape.wiki/osrs/item/1391) (173K)\n2 x [Blood essence](https://prices.runescape.wiki/osrs/item/26392) (166K)\nFrom: [Tombs of Amascut: Expert Mode](https://oldschool.runescape.wiki/w/Tombs_of_Amascut)",
      author: { name: "StWidu93" },
      thumbnail: { url: "https://cdn.example.com/thumb.png" },
      image: { url: "https://cdn.example.com/screenshot.png" },
      fields: [
        { name: "Completion Count", value: "189" },
        { name: "Total Value", value: "396K gp" },
        { name: "Party Size", value: "1" },
      ],
    }],
  },
  {
    id: "d3", timestamp: "2026-08-23T02:00:00Z",
    content: "",
    embeds: [{
      title: "Quest Completed",
      description: "Artolux has completed a quest: [Shades of Mort'ton](https://oldschool.runescape.wiki/w/Shades_of_Mort%27ton)",
      author: { name: "Artolux" },
      fields: [
        { name: "Completed Quests", value: "151/182 (83.0%)" },
        { name: "Quest Points", value: "277/341 (81.2%)" },
      ],
    }],
  },
  {
    id: "d4", timestamp: "2026-08-23T01:00:00Z",
    content: "",
    embeds: [{
      title: "Loot Drop",
      description: "FeIronBtw has looted:\n\n1 x [Twisted bow](https://prices.runescape.wiki/osrs/item/20997) (1.4B)\nFrom: [Chambers of Xeric](https://oldschool.runescape.wiki/w/Chambers_of_Xeric)",
      author: { name: "FeIronBtw" },
      fields: [
        { name: "Completion Count", value: "412" },
        { name: "Total Value", value: "1.4B gp" },
      ],
    }],
  },
];

console.log("== old-format tests ==");
const items = transformMessages(messages);
items.forEach((i) => console.log(`  [${i.type}] ${i.medal} ${i.player} : ${i.what}`));

console.log("\n== Dink-format tests ==");
const dink = transformMessages(dinkMessages);
dink.forEach((i) => console.log(`  [${i.type}] ${i.medal} ${i.player} : ${i.what} | ${i.detail}`));

const checks = [
  // old-format embed checks
  ["parses embed with author name", items[0].player === "Fe Misfit"],
  ["classifies twisted bow as drop", items[0].type === "drop"],
  ["drop medal is \u{1f4b0}", items[0].medal === "\u{1f4b0}"],
  ["parses pet from embed", items[1].type === "pet"],
  ["pet medal is \u{1f426}", items[1].medal === "\u{1f426}"],
  ["parses xp from plain content", items[2].type === "xp"],
  ["extracts player from content pattern", items[2].player === "SkillerNoPk"],
  ["parses combat achievement", items[3].type === "ca"],
  ["ca medal is ⭐", items[3].medal === "⭐"],
  ["parses personal best", items[4].type === "pb"],
  ["pb medal is ⏱️", items[4].medal === "⏱️"],
  ["detail empty for plain content", items[2].detail === ""],
  ["skips empty message (no content, no embeds)", items.length === 5],
  ["respects limit option", transformMessages(messages, { limit: 2 }).length === 2],
  ["handles empty array", transformMessages([]).length === 0],
  ["handles null input", transformMessages(null).length === 0],
  ["parseDinkMessage returns null for empty", parseDinkMessage({ content: "", embeds: [] }) === null],

  // Dink-format: Level Up
  ["dink level up type", dink[0].type === "xp"],
  ["dink level up player", dink[0].player === "StWidu93"],
  ["dink level up strips md links", !dink[0].what.includes("[")],
  ["dink level up extracts skill+level", dink[0].what === "Levelled Magic to 97"],
  ["dink level up medal", dink[0].medal === "\u{1f3af}"],

  // Dink-format: Loot Drop
  ["dink loot type", dink[1].type === "drop"],
  ["dink loot player", dink[1].player === "StWidu93"],
  ["dink loot shows item names", dink[1].what.includes("Battlestaff")],
  ["dink loot shows second item", dink[1].what.includes("Blood essence")],
  ["dink loot strips md links from items", !dink[1].what.includes("[")],
  ["dink loot detail has source", dink[1].detail.includes("Tombs of Amascut")],
  ["dink loot detail has KC", dink[1].detail.includes("189 KC")],
  ["dink loot detail has value", dink[1].detail.includes("396K gp")],

  // Dink-format: Quest Completed
  ["dink quest type", dink[2].type === "quest"],
  ["dink quest player", dink[2].player === "Artolux"],
  ["dink quest extracts name", dink[2].what.includes("Shades of Mort'ton")],
  ["dink quest strips md links", !dink[2].what.includes("[")],
  ["dink quest detail has quest count", dink[2].detail.includes("151/182")],
  ["dink quest detail has QP", dink[2].detail.includes("277/341")],

  // Dink-format: single high-value drop
  ["dink single drop shows item", dink[3].what.includes("Twisted bow")],
  ["dink single drop has KC", dink[3].detail.includes("412 KC")],
  ["dink single drop has value", dink[3].detail.includes("1.4B gp")],

  // Thumbnail / image passthrough
  ["dink loot has thumbnail", dink[1].thumbnail === "https://cdn.example.com/thumb.png"],
  ["dink loot has image", dink[1].image === "https://cdn.example.com/screenshot.png"],
  ["dink level up no thumbnail", dink[0].thumbnail === ""],
  ["dink level up no image", dink[0].image === ""],

  // Non-breaking spaces in detail values
  ["nbsp between kc number and KC", dink[1].detail.includes("189 KC")],
  ["nbsp in total value", dink[1].detail.includes("396K gp")],
  ["nbsp in quest detail", dink[2].detail.includes(" quests")],
  ["nbsp in QP detail", dink[2].detail.includes(" QP")],

  // Code block stripping in field values
  ["code block stripped from field", (() => {
    const r = parseDinkMessage({
      content: "",
      embeds: [{
        title: "Loot Drop",
        description: "TestPlayer has looted:\n\n1 x Bones\nFrom: Zulrah",
        author: { name: "TestPlayer" },
        fields: [
          { name: "Completion Count", value: "``` 197 ```" },
          { name: "Total Value", value: "```ldif\n17.0M gp```" },
        ],
      }],
    });
    return r && r.detail.includes("197 KC") && r.detail.includes("17.0M gp") && !r.detail.includes("```");
  })()],
];

console.log("\nchecks:");
let pass = true;
for (const [label, cond] of checks) {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
  if (!cond) pass = false;
}
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
