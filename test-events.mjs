import { transformThreads, parseEventForgeDateField, teamFromEmoji, extractTeamEmbed, parseTeams, isCheckmark, extractParticipantEmbed, parseParticipants } from "./functions/api/events.js";

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
ok.push(["4 events (giveaway filtered out)", out.length === 4]);
ok.push(["giveaway thread excluded", !out.find(e => e.id === "1002")]);
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
  out[0].name === "Screenshots loot event level 100+",
]);
ok.push([
  "second scheduled is next newest",
  out[1].name === "BARROWS WEEKEND LONG EVENT 8/28-8/30",
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
ok.push([
  "End without s parses via Ends? pattern",
  parseEventForgeDateField("End: Sunday, August 30, 2026 at 10:00 PM", "Ends?") != null,
]);
ok.push([
  "Ends still parses via Ends? pattern",
  parseEventForgeDateField("Ends: Sunday, August 30, 2026 at 10:00 PM", "Ends?") != null,
]);
ok.push([
  "Ends? does not match inside Weekend:",
  parseEventForgeDateField("Weekend: fun for all", "Ends?") == null,
]);

// End: (no s) in transformThreads
const endNoSThreads = [{
  id: "2005", name: "BARROWS ALL WEEKEND", parent_id: "9999", message_count: 5,
  thread_metadata: { archived: false, create_timestamp: "2026-08-24T20:00:00Z" },
}];
const endNoSMessages = [{
  id: "2005",
  content: "How it works\nWhen: Friday, August 28, 2026 at 3:00 PM\nEnd: Sunday, August 30, 2026 at 10:00 PM",
  attachments: [],
}];
const endNoSOut = transformThreads(endNoSThreads, endNoSMessages);
ok.push([
  "End: line (no s) populates endTime",
  endNoSOut[0].endTime != null && new Date(endNoSOut[0].endTime).getDate() === 30,
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
  "EventForge metadata lines preserved in description",
  forgeOut[0].description.includes("When:") && forgeOut[0].description.includes("Ends:"),
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
  "Discord token metadata lines preserved in description",
  tokenOut[0].description.includes("When:") && tokenOut[0].description.includes("Ends:"),
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
  "World line preserved in description",
  metaOut[0].description.includes("World:"),
]);
ok.push([
  "Meet line preserved in description",
  metaOut[0].description.includes("Meet:"),
]);
ok.push([
  "emoji-prefixed When line preserved",
  metaOut[0].description.includes("When:"),
]);
ok.push([
  "emoji-prefixed Ends line preserved",
  metaOut[0].description.includes("Ends:"),
]);
ok.push([
  "non-metadata lines preserved in description",
  metaOut[0].description.includes("Bring your gear!"),
]);

// Tag resolution tests
const tagMap = new Map([["tag_001", "Loot Value"], ["tag_002", "PVM"], ["tag_003", "Entry"]]);
const tagThreads = [
  {
    id: "2501", name: "Barrows Loot Race", parent_id: "9999", message_count: 5,
    thread_metadata: { archived: false, create_timestamp: "2026-08-26T12:00:00Z" },
    applied_tags: ["tag_001", "tag_002"],
  },
  {
    id: "2502", name: "PVP Tournament", parent_id: "9999", message_count: 3,
    thread_metadata: { archived: false, create_timestamp: "2026-08-25T12:00:00Z" },
    applied_tags: ["tag_002"],
  },
  {
    id: "2503", name: "No Tags Event", parent_id: "9999", message_count: 1,
    thread_metadata: { archived: false, create_timestamp: "2026-08-24T12:00:00Z" },
  },
];
const tagMessages = [
  { id: "2501", content: "Barrows loot race!", attachments: [] },
  { id: "2502", content: "PVP event!", attachments: [] },
  { id: "2503", content: "No tags here.", attachments: [] },
];
const tagOut = transformThreads(tagThreads, tagMessages, tagMap);
ok.push([
  "tags resolved from applied_tags via tagMap",
  JSON.stringify(tagOut.find(e => e.id === "2501").tags) === JSON.stringify(["Loot Value", "PVM"]),
]);
ok.push([
  "single tag resolved correctly",
  JSON.stringify(tagOut.find(e => e.id === "2502").tags) === JSON.stringify(["PVM"]),
]);
ok.push([
  "missing applied_tags gives empty tags array",
  JSON.stringify(tagOut.find(e => e.id === "2503").tags) === JSON.stringify([]),
]);
ok.push([
  "no tagMap gives empty tags arrays",
  transformThreads(tagThreads, tagMessages).every(e => JSON.stringify(e.tags) === "[]"),
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

// teamFromEmoji tests
ok.push(["teamFromEmoji: A emoji", teamFromEmoji("🅰") === "a"]);
ok.push(["teamFromEmoji: B emoji", teamFromEmoji("🅱") === "b"]);
ok.push(["teamFromEmoji: C emoji", teamFromEmoji("🇨") === "c"]);
ok.push(["teamFromEmoji: D emoji", teamFromEmoji("🇩") === "d"]);
ok.push(["teamFromEmoji: null for random emoji", teamFromEmoji("😀") === null]);
ok.push(["teamFromEmoji: null for empty", teamFromEmoji("") === null]);
ok.push(["teamFromEmoji: null for null", teamFromEmoji(null) === null]);

// extractTeamEmbed tests
ok.push(["extractTeamEmbed: Team Assigned", (() => {
  const r = extractTeamEmbed({ embeds: [{ title: "Team Assigned", fields: [{ name: "Player", value: "Flash" }, { name: "Team", value: "Team A" }] }] });
  return r && r.player === "Flash" && r.team === "a";
})()]);
ok.push(["extractTeamEmbed: Team Removed", (() => {
  const r = extractTeamEmbed({ embeds: [{ title: "Team Removed", fields: [{ name: "Player", value: "Flash" }] }] });
  return r && r.player === "Flash" && r.team === null;
})()]);
ok.push(["extractTeamEmbed: ignores non-team embed", extractTeamEmbed({ embeds: [{ title: "Entry Added" }] }) === null]);
ok.push(["extractTeamEmbed: no embeds", extractTeamEmbed({ embeds: [] }) === null]);
ok.push(["extractTeamEmbed: missing embeds array", extractTeamEmbed({}) === null]);

// parseTeams tests
ok.push(["parseTeams: reactions assign teams", (() => {
  const msgs = [
    { id: "100", author: { global_name: "Alice" }, reactions: [{ emoji: { name: "🅰" } }] },
    { id: "101", author: { global_name: "Bob" }, reactions: [{ emoji: { name: "🅱" } }] },
  ];
  const t = parseTeams(msgs);
  return t && t.a && t.a[0] === "Alice" && t.b && t.b[0] === "Bob";
})()]);
ok.push(["parseTeams: bot embed overrides reaction", (() => {
  const msgs = [
    { id: "100", author: { global_name: "Alice" }, reactions: [{ emoji: { name: "🅰" } }] },
    { id: "200", embeds: [{ title: "Team Assigned", fields: [{ name: "Player", value: "Alice" }, { name: "Team", value: "Team B" }] }] },
  ];
  const t = parseTeams(msgs);
  return t && !t.a && t.b && t.b[0] === "Alice";
})()]);
ok.push(["parseTeams: Team Removed clears assignment", (() => {
  const msgs = [
    { id: "100", embeds: [{ title: "Team Assigned", fields: [{ name: "Player", value: "Alice" }, { name: "Team", value: "Team A" }] }] },
    { id: "200", embeds: [{ title: "Team Removed", fields: [{ name: "Player", value: "Alice" }] }] },
  ];
  return parseTeams(msgs) === null;
})()]);
ok.push(["parseTeams: empty messages returns null", parseTeams([]) === null]);
ok.push(["parseTeams: null returns null", parseTeams(null) === null]);
ok.push(["parseTeams: players sorted alphabetically", (() => {
  const msgs = [
    { id: "100", author: { global_name: "Charlie" }, reactions: [{ emoji: { name: "🅰" } }] },
    { id: "101", author: { global_name: "Alice" }, reactions: [{ emoji: { name: "🅰" } }] },
  ];
  const t = parseTeams(msgs);
  return t && t.a[0] === "Alice" && t.a[1] === "Charlie";
})()]);

// transformThreads with teams
ok.push(["transformThreads: teams field null when no team data", (() => {
  const t = [{ id: "5001", name: "No Teams", parent_id: "9999", message_count: 1, thread_metadata: { archived: false, create_timestamp: "2026-08-26T12:00:00Z" } }];
  const m = [{ id: "5001", content: "Just an event", attachments: [] }];
  const result = transformThreads(t, m, null, new Map([["5001", [{ id: "5001", content: "Just an event" }]]]));
  return result[0].teams === null;
})()]);
ok.push(["transformThreads: teams populated from threadMessages", (() => {
  const t = [{ id: "5002", name: "Team Event", parent_id: "9999", message_count: 3, thread_metadata: { archived: false, create_timestamp: "2026-08-26T12:00:00Z" } }];
  const m = [{ id: "5002", content: "Teams event!", attachments: [] }];
  const tm = new Map([["5002", [
    { id: "5002", content: "Teams event!" },
    { id: "5003", author: { global_name: "Flash" }, reactions: [{ emoji: { name: "🅰" } }] },
  ]]]);
  const result = transformThreads(t, m, null, tm);
  return result[0].teams && result[0].teams.a && result[0].teams.a[0] === "Flash";
})()]);

// isCheckmark tests
ok.push(["isCheckmark: green check emoji", isCheckmark("✅") === true]);
ok.push(["isCheckmark: random emoji returns false", isCheckmark("😀") === false]);
ok.push(["isCheckmark: null returns false", isCheckmark(null) === false]);
ok.push(["isCheckmark: empty string returns false", isCheckmark("") === false]);
ok.push(["isCheckmark: team A emoji is not checkmark", isCheckmark("🅰") === false]);

// extractParticipantEmbed tests
ok.push(["extractParticipantEmbed: Participant Added", (() => {
  const r = extractParticipantEmbed({ embeds: [{ title: "Participant Added", fields: [{ name: "Player", value: "Flash" }] }] });
  return r && r.player === "Flash" && r.added === true;
})()]);
ok.push(["extractParticipantEmbed: Participant Removed", (() => {
  const r = extractParticipantEmbed({ embeds: [{ title: "Participant Removed", fields: [{ name: "Player", value: "Flash" }] }] });
  return r && r.player === "Flash" && r.added === false;
})()]);
ok.push(["extractParticipantEmbed: ignores non-participant embed", extractParticipantEmbed({ embeds: [{ title: "Team Assigned" }] }) === null]);
ok.push(["extractParticipantEmbed: no embeds", extractParticipantEmbed({ embeds: [] }) === null]);
ok.push(["extractParticipantEmbed: missing embeds array", extractParticipantEmbed({}) === null]);
ok.push(["extractParticipantEmbed: missing Player field", extractParticipantEmbed({ embeds: [{ title: "Participant Added", fields: [{ name: "Team", value: "A" }] }] }) === null]);

// parseParticipants tests (reactors-based)
ok.push(["parseParticipants: reactors add participants", (() => {
  const reactors = [
    { id: "1", global_name: "Alice", username: "alice" },
    { id: "2", global_name: "Bob", username: "bob" },
  ];
  const p = parseParticipants(null, reactors);
  return p && p.length === 2 && p[0] === "Alice" && p[1] === "Bob";
})()]);
ok.push(["parseParticipants: bot reactors skipped", (() => {
  const reactors = [
    { id: "1", global_name: "Alice", username: "alice" },
    { id: "2", global_name: "BotUser", username: "bot", bot: true },
  ];
  const p = parseParticipants(null, reactors);
  return p && p.length === 1 && p[0] === "Alice";
})()]);
ok.push(["parseParticipants: bot embed adds participant", (() => {
  const msgs = [
    { id: "100", embeds: [{ title: "Participant Added", fields: [{ name: "Player", value: "Flash" }] }] },
  ];
  const p = parseParticipants(msgs);
  return p && p.length === 1 && p[0] === "Flash";
})()]);
ok.push(["parseParticipants: bot embed removal clears participant", (() => {
  const msgs = [
    { id: "100", embeds: [{ title: "Participant Added", fields: [{ name: "Player", value: "Flash" }] }] },
    { id: "200", embeds: [{ title: "Participant Removed", fields: [{ name: "Player", value: "Flash" }] }] },
  ];
  return parseParticipants(msgs) === null;
})()]);
ok.push(["parseParticipants: bot embed removal overrides reactor", (() => {
  const reactors = [{ id: "1", global_name: "Flash", username: "flash" }];
  const msgs = [
    { id: "200", embeds: [{ title: "Participant Removed", fields: [{ name: "Player", value: "Flash" }] }] },
  ];
  return parseParticipants(msgs, reactors) === null;
})()]);
ok.push(["parseParticipants: sorted alphabetically", (() => {
  const reactors = [
    { id: "1", global_name: "Charlie", username: "charlie" },
    { id: "2", global_name: "Alice", username: "alice" },
  ];
  const p = parseParticipants(null, reactors);
  return p && p[0] === "Alice" && p[1] === "Charlie";
})()]);
ok.push(["parseParticipants: empty returns null", parseParticipants([], []) === null]);
ok.push(["parseParticipants: null returns null", parseParticipants(null, null) === null]);
ok.push(["parseParticipants: uses username fallback", (() => {
  const reactors = [{ id: "1", username: "bob123" }];
  const p = parseParticipants(null, reactors);
  return p && p[0] === "bob123";
})()]);
ok.push(["parseParticipants: reactors + bot embed merge", (() => {
  const reactors = [
    { id: "1", global_name: "Alice", username: "alice" },
  ];
  const msgs = [
    { id: "100", embeds: [{ title: "Participant Added", fields: [{ name: "Player", value: "Flash" }] }] },
  ];
  const p = parseParticipants(msgs, reactors);
  return p && p.length === 2 && p[0] === "Alice" && p[1] === "Flash";
})()]);

// transformThreads with participants
ok.push(["transformThreads: participants null when no participant data", (() => {
  const t = [{ id: "6001", name: "No Participants", parent_id: "9999", message_count: 1, thread_metadata: { archived: false, create_timestamp: "2026-08-26T12:00:00Z" } }];
  const m = [{ id: "6001", content: "Just an event", attachments: [] }];
  const result = transformThreads(t, m, null, new Map([["6001", [{ id: "6001", content: "Just an event" }]]]));
  return result[0].participants === null;
})()]);
ok.push(["transformThreads: participants from reactors", (() => {
  const t = [{ id: "6002", name: "Participant Event", parent_id: "9999", message_count: 3, thread_metadata: { archived: false, create_timestamp: "2026-08-26T12:00:00Z" } }];
  const m = [{ id: "6002", content: "Join up!", attachments: [] }];
  const tm = new Map([["6002", [{ id: "6002", content: "Join up!" }]]]);
  const tr = new Map([["6002", [{ id: "1", global_name: "Flash", username: "flash" }]]]);
  const result = transformThreads(t, m, null, tm, tr);
  return result[0].participants && result[0].participants.length === 1 && result[0].participants[0] === "Flash";
})()]);

console.log("\nchecks:");
let pass = true;
for (const [label, cond] of ok) {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
  if (!cond) pass = false;
}
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
