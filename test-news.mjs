import { transformMessages, formatContent } from "./functions/api/news.js";

// Discord returns newest-first
const messages = [
  { id: "1", type: 0, timestamp: "2026-08-23T10:00:00Z",
    author: { id: "111", username: "koiox", global_name: "koi ox", avatar: "abc" },
    content: "**Recruitment is open**\nBring a friend — referral shoutouts every Friday. Ping <@123> in <#456>.",
    attachments: [], reactions: [{ emoji: { name: "✅" }, count: 2 }] },
  { id: "2", type: 0, timestamp: "2026-08-23T09:00:00Z",
    author: { id: "222", username: "mrflsh", global_name: "mr flsh", avatar: null },
    content: "CoX mass tonight 8pm — check https://wiseoldman.net for standings",
    attachments: [], reactions: [] },
  { id: "3", type: 0, timestamp: "2026-08-23T08:00:00Z",
    author: { id: "333", username: "dinkbot", bot: true },
    content: "Fe Misfit received a drop: Twisted bow", attachments: [] },   // bot -> skipped
  { id: "4", type: 7, timestamp: "2026-08-23T07:00:00Z",
    author: { id: "444", username: "newguy" }, content: "" },              // system join -> skipped
  { id: "5", type: 0, timestamp: "2026-08-23T06:00:00Z",
    author: { id: "555", username: "artolux", global_name: "Artolux", avatar: "def" },
    content: "Screenshot dump", attachments: [{ content_type: "image/png", url: "https://cdn.discordapp.com/x.png" }],
    reactions: [] },
];

console.log("== default (show all non-bot) ==");
const all = transformMessages(messages);
all.forEach((i) => console.log(`  [${i.author}] ${i.titleHtml}${i.image ? "  (img)" : ""}`));

console.log("\n== reaction-gated on ✅ ==");
const gated = transformMessages(messages, { reaction: "✅" });
gated.forEach((i) => console.log(`  [${i.author}] ${i.titleHtml}`));

console.log("\n== formatContent samples ==");
console.log("  " + formatContent("**bold** *italic* `code` <@123> <#456> <:pog:789> http://x.com"));
console.log("  " + formatContent("<a:alarm:123456> Check this out @everyone"));
console.log("  " + formatContent("See https://discord.com/channels/123/456/789 for details"));

const checks = [
  ["skips bot message", !all.some((i) => i.author === "dinkbot")],
  ["skips system join", !all.some((i) => i.id === "4")],
  ["keeps 3 real posts", all.length === 3],
  ["parses image attachment", all.some((i) => i.image === "https://cdn.discordapp.com/x.png")],
  ["title splits from body", all[0].bodyHtml.includes("referral")],
  ["reaction gate keeps only ✅ post", gated.length === 1 && gated[0].id === "1"],
  ["no raw angle brackets leak", !formatContent("<script>").includes("<script>")],
  ["bold converts", formatContent("**x**").includes("<strong>")],
  ["custom emoji stripped", !formatContent("<a:alarm:123>").includes("alarm")],
  ["@everyone stripped", !formatContent("Hey @everyone check this").includes("@everyone")],
  ["discord channel link stripped", !formatContent("See https://discord.com/channels/123/456/789 now").includes("discord.com")],
];
console.log("\nchecks:");
let pass = true;
for (const [l, c] of checks) { console.log(`  [${c ? "PASS" : "FAIL"}] ${l}`); if (!c) pass = false; }
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
