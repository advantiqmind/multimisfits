import { transformThreads, parseEventForgeDateField } from "./functions/api/events.js";

const threads = [
  {
    id: "1001",
    name: "BARROWS WEEKEND LONG EVENT 8/28-8/30",
    parent_id: "9999",
    message_count: 8,
    thread_metadata: {
      archived: false,
      create_timestamp: "2026-08-24T20:04:00Z",
    },
  },
  {
    id: "1002",
    name: "MULTIMISFITS BOND GIVEAWAY",
    parent_id: "9999",
    message_count: 6,
    thread_metadata: {
      archived: false,
      create_timestamp: "2026-08-26T12:00:00Z",
    },
  },
  {
    id: "1003",
    name: "EVENT 4/5/2026",
    parent_id: "9999",
    message_count: 31,
    thread_metadata: {
      archived: true,
      create_timestamp: "2026-04-05T20:00:00Z",
    },
  },
  {
    id: "1004",
    name: "Event 2/15/26",
    parent_id: "9999",
    message_count: 32,
    thread_metadata: {
      archived: true,
      create_timestamp: "2026-02-15T20:00:00Z",
    },
  },
  {
    id: "1005",
    name: "Screenshots loot event level 100+",
    parent_id: "9999",
    message_count: 10,
    thread_metadata: {
      archived: false,
      create_timestamp: "2026-08-25T18:00:00Z",
    },
  },
];

const openingMessages = [
  {
    id: "1001",
    content: "Signups start Thursday. We will @everyone to let you know!",
    attachments: [
      { content_type: "image/png", url: "https://cdn.example.com/barrows.png" },
    ],
  },
  {
    id: "1002",
    content: "THE MULTIMISFITS BOND GIVEAWAY IS LIVE!",
    attachments: [],
  },
  {
    id: "1003",
    content: "HIDE AND SEEK",
    attachments: [],
  },
  {
    id: "1004",
    content: "HIDE AND SEEK POST YOUR SCREEN SHOT HINTS HERE",
    attachments: [
      { content_type: "image/jpeg", url: "https://cdn.example.com/hints.jpg" },
    ],
  },
  null, // failed to fetch opening message for 1005
];

const out = transformThreads(threads, openingMessages);

console.log("transformed forum events:");
for (const ev of out) {
  console.log(
    `  [${ev.status.padEnd(9)}] ${ev.name.padEnd(45)} replies=${ev.interestedCount}`
  );
}

const ok = [];
ok.push(["5 events total", out.length === 5]);
ok.push([
  "scheduled (non-archived) events sort first",
  out[0].status === "scheduled",
]);
ok.push([
  "completed (archived) events sort last",
  out[out.length - 1].status === "completed",
]);
ok.push([
  "scheduled sorted by newest first",
  out[0].name === "MULTIMISFITS BOND GIVEAWAY",
]);
ok.push([
  "second scheduled is next newest",
  out[1].name === "Screenshots loot event level 100+",
]);
ok.push([
  "completed sorted by newest first",
  out.filter((e) => e.status === "completed")[0].name === "EVENT 4/5/2026",
]);
ok.push([
  "interestedCount maps to message_count",
  out.find((e) => e.id === "1001").interestedCount === 8,
]);
ok.push([
  "description from opening message",
  out.find((e) => e.id === "1001").description.startsWith("Signups start"),
]);
ok.push([
  "image extracted from attachments",
  out.find((e) => e.id === "1001").image === "https://cdn.example.com/barrows.png",
]);
ok.push([
  "missing opening message gives empty description",
  out.find((e) => e.id === "1005").description === "",
]);
ok.push([
  "missing opening message gives null image",
  out.find((e) => e.id === "1005").image === null,
]);
ok.push([
  "endTime is null for forum threads",
  out.every((e) => e.endTime === null),
]);
ok.push([
  "hasParsedDate is false when no EventForge date",
  out.find((e) => e.id === "1001").hasParsedDate === false,
]);
ok.push([
  "empty input returns empty array",
  transformThreads([], []).length === 0,
]);
ok.push([
  "null input returns empty array",
  transformThreads(null, null).length === 0,
]);

// EventForge date parsing tests
ok.push([
  "parseEventForgeDateField extracts When date",
  parseEventForgeDateField("When: Friday, August 28, 2026 at 3:00 PM", "When") != null,
]);
ok.push([
  "parseEventForgeDateField parses correct month",
  new Date(parseEventForgeDateField("When: Friday, August 28, 2026 at 3:00 PM", "When")).getMonth() === 7,
]);
ok.push([
  "parseEventForgeDateField parses correct day",
  new Date(parseEventForgeDateField("When: Friday, August 28, 2026 at 3:00 PM", "When")).getDate() === 28,
]);
ok.push([
  "parseEventForgeDateField extracts Ends date",
  parseEventForgeDateField("Ends: Sunday, August 30, 2026 at 10:00 PM", "Ends") != null,
]);
ok.push([
  "parseEventForgeDateField skips relative time",
  parseEventForgeDateField("Starts: in 2 days", "Starts") === null,
]);
ok.push([
  "parseEventForgeDateField returns null for missing field",
  parseEventForgeDateField("No date here", "When") === null,
]);
ok.push([
  "parseEventForgeDateField handles multiline content",
  parseEventForgeDateField("Title\nWhen: Saturday, September 6, 2026 at 8:00 PM\nEnds: Sunday", "When") != null,
]);

// Discord timestamp token parsing
ok.push([
  "parses Discord timestamp token <t:epoch:F>",
  parseEventForgeDateField("When: <t:1724871600:F>", "When") != null,
]);
ok.push([
  "Discord timestamp epoch gives correct date",
  new Date(parseEventForgeDateField("When: <t:1724871600:F>", "When")).getUTCDate() === 28,
]);
ok.push([
  "Discord timestamp without format flag",
  parseEventForgeDateField("When: <t:1724871600>", "When") != null,
]);
ok.push([
  "Ends with Discord timestamp token",
  parseEventForgeDateField("Ends: <t:1725058800:F>", "Ends") != null,
]);

// EventForge dates in transformThreads (plain text)
const forgeThreads = [{
  id: "2001", name: "BARROWS WEEKEND", parent_id: "9999", message_count: 5,
  thread_metadata: { archived: false, create_timestamp: "2026-08-24T20:00:00Z" },
}];
const forgeMessages = [{
  id: "2001",
  content: "BARROWS WEEKEND\nWhen: Friday, August 28, 2026 at 3:00 PM\nStarts: in 2 days\nEnds: Sunday, August 30, 2026 at 10:00 PM",
  attachments: [],
}];
const forgeOut = transformThreads(forgeThreads, forgeMessages);
ok.push([
  "EventForge When overrides thread creation date",
  new Date(forgeOut[0].startTime).getDate() === 28,
]);
ok.push([
  "EventForge Ends populates endTime",
  forgeOut[0].endTime != null && new Date(forgeOut[0].endTime).getDate() === 30,
]);
ok.push([
  "hasParsedDate is true when EventForge When found",
  forgeOut[0].hasParsedDate === true,
]);
ok.push([
  "EventForge metadata lines stripped from description",
  !forgeOut[0].description.includes("When:") && !forgeOut[0].description.includes("Starts:") && !forgeOut[0].description.includes("Ends:"),
]);
ok.push([
  "non-metadata content preserved in description",
  forgeOut[0].description.includes("BARROWS WEEKEND"),
]);

// EventForge with Discord timestamp tokens in transformThreads
const tokenThreads = [{
  id: "2002", name: "BARROWS TOKEN TEST", parent_id: "9999", message_count: 3,
  thread_metadata: { archived: false, create_timestamp: "2026-08-24T20:00:00Z" },
}];
const tokenMessages = [{
  id: "2002",
  content: "BARROWS EVENT\nWhen: <t:1724871600:F>\nStarts: <t:1724871600:R>\nEnds: <t:1725058800:F>",
  attachments: [],
}];
const tokenOut = transformThreads(tokenThreads, tokenMessages);
ok.push([
  "Discord token When overrides thread creation date",
  new Date(tokenOut[0].startTime).getUTCDate() === 28,
]);
ok.push([
  "Discord token Ends populates endTime",
  tokenOut[0].endTime != null && new Date(tokenOut[0].endTime).getUTCDate() === 30,
]);
ok.push([
  "Discord token metadata lines stripped from description",
  !tokenOut[0].description.includes("When:") && !tokenOut[0].description.includes("Ends:"),
]);

// World/Meet line stripping
const metaThreads = [{
  id: "2003", name: "COX MASS", parent_id: "9999", message_count: 4,
  thread_metadata: { archived: false, create_timestamp: "2026-08-26T20:00:00Z" },
}];
const metaMessages = [{
  id: "2003",
  content: "COX MASS\n📅 When: <t:1724871600:F>\n⏳ Starts: <t:1724871600:R>\n💀 Ends: <t:1725058800:F>\n🌐 World: 329\n📍 Meet: Discord Events Voice Chat\nBring your gear!",
  attachments: [],
}];
const metaOut = transformThreads(metaThreads, metaMessages);
ok.push([
  "World line stripped from description",
  !metaOut[0].description.includes("World:"),
]);
ok.push([
  "Meet line stripped from description",
  !metaOut[0].description.includes("Meet:"),
]);
ok.push([
  "emoji-prefixed When line stripped",
  !metaOut[0].description.includes("When:"),
]);
ok.push([
  "emoji-prefixed Starts line stripped",
  !metaOut[0].description.includes("Starts:"),
]);
ok.push([
  "emoji-prefixed Ends line stripped",
  !metaOut[0].description.includes("Ends:"),
]);
ok.push([
  "non-metadata lines preserved after stripping",
  metaOut[0].description.includes("Bring your gear!"),
]);

// Mention resolution tests
const mentionThreads = [{
  id: "3001", name: "Test Event", parent_id: "9999", message_count: 3,
  thread_metadata: { archived: false, create_timestamp: "2026-08-26T12:00:00Z" },
}];
const mentionMessages = [{
  id: "3001",
  content: "Congrats to <@555> for being ranked up! And <@666> too!",
  attachments: [],
  mentions: [
    { id: "555", username: "stwidu", global_name: "StWidu93" },
    { id: "666", username: "artolux", global_name: "Artolux" },
  ],
}];
const mentionOut = transformThreads(mentionThreads, mentionMessages);
ok.push([
  "mention resolved to display name",
  mentionOut[0].description.includes("**StWidu93**"),
]);
ok.push([
  "second mention also resolved",
  mentionOut[0].description.includes("**Artolux**"),
]);
ok.push([
  "raw mention tag removed",
  !mentionOut[0].description.includes("<@555>"),
]);

console.log("\nchecks:");
let pass = true;
for (const [label, cond] of ok) {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
  if (!cond) pass = false;
}
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
