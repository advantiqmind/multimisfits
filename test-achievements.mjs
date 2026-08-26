import { transformMessages, parseDinkMessage } from "./functions/api/achievements.js";

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

console.log("== parseDinkMessage tests ==");
const items = transformMessages(messages);
items.forEach((i) => console.log(`  [${i.type}] ${i.medal} ${i.player} — ${i.what}`));

const checks = [
  ["parses embed with author name", items[0].player === "Fe Misfit"],
  ["classifies twisted bow as drop", items[0].type === "drop"],
  ["drop medal is 💰", items[0].medal === "💰"],
  ["parses pet from embed", items[1].type === "pet"],
  ["pet medal is 🐦", items[1].medal === "🐦"],
  ["parses xp from plain content", items[2].type === "xp"],
  ["extracts player from content pattern", items[2].player === "SkillerNoPk"],
  ["parses combat achievement", items[3].type === "ca"],
  ["ca medal is ⭐", items[3].medal === "⭐"],
  ["parses personal best", items[4].type === "pb"],
  ["pb medal is ⏱️", items[4].medal === "⏱️"],
  ["detail from embed description", items[0].detail === "Chambers of Xeric — 412 KC"],
  ["detail empty for plain content", items[2].detail === ""],
  ["skips empty message (no content, no embeds)", items.length === 5],
  ["respects limit option", transformMessages(messages, { limit: 2 }).length === 2],
  ["handles empty array", transformMessages([]).length === 0],
  ["handles null input", transformMessages(null).length === 0],
  ["parseDinkMessage returns null for empty", parseDinkMessage({ content: "", embeds: [] }) === null],
];

console.log("\nchecks:");
let pass = true;
for (const [label, cond] of checks) {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
  if (!cond) pass = false;
}
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
