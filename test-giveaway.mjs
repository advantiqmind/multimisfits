import {
  transformGiveawayData,
  parsePrize,
  parseEntryRate,
  extractEntryCountFromReactions,
  extractBotEntry,
  parseEventForgeDateField,
} from "./functions/api/giveaway.js";

const THREAD_ACTIVE = {
  id: "2001",
  name: "BOND GIVEAWAY ROUND 2",
  parent_id: "8888",
  message_count: 12,
  thread_metadata: {
    archived: false,
    create_timestamp: "2026-08-23T12:00:00Z",
  },
};

const THREAD_ENDED = {
  id: "2002",
  name: "BOND GIVEAWAY ROUND 1",
  parent_id: "8888",
  message_count: 25,
  thread_metadata: {
    archived: true,
    create_timestamp: "2026-07-15T12:00:00Z",
  },
};

const OPENING_MSG = {
  id: "2001",
  content:
    "Prize: 1 Old School Bond\nRate: 1M GP = 1 entry\n\nWhen: Friday, August 23, 2026 at 8:00 PM\nEnds: Saturday, September 6, 2026 at 11:59 PM\n\nPost a screenshot of your donation to the clan bank!",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  mentions: [],
  attachments: [{ url: "https://cdn.example.com/banner.png", content_type: "image/png" }],
  reactions: [],
};

const SCREENSHOT_1_ENTRY = {
  id: "3001",
  content: "Here is my donation screenshot",
  author: { id: "200", global_name: "Vilence", username: "vilence" },
  mentions: [],
  attachments: [{ url: "https://cdn.example.com/screenshot.png", content_type: "image/png" }],
  reactions: [{ emoji: { name: "1️⃣" }, count: 1 }],
};

const SCREENSHOT_2_ENTRIES = {
  id: "3004",
  content: "My donation",
  author: { id: "300", global_name: "Artolux", username: "artolux" },
  mentions: [],
  attachments: [],
  reactions: [{ emoji: { name: "2️⃣" }, count: 1 }],
};

const SCREENSHOT_NO_REACTION = {
  id: "3003",
  content: "My screenshot",
  author: { id: "400", global_name: "Bwita", username: "bwita" },
  mentions: [],
  attachments: [],
  reactions: [],
};

const WINNER_MSG_TROPHY = {
  id: "3010",
  content: "\u{1F3C6} Congratulations Vilence! You won the bond!",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  pinned: false,
  mentions: [{ id: "200", global_name: "Vilence", username: "vilence" }],
  attachments: [],
  reactions: [],
  timestamp: "2026-09-06T23:59:00Z",
};

const WINNER_MSG_PINNED = {
  id: "3011",
  content: "Congratulations! Winner announced!",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  pinned: true,
  mentions: [],
  attachments: [],
  reactions: [],
  timestamp: "2026-09-06T23:59:00Z",
};

const CHAT_MSG = {
  id: "3020",
  content: "Good luck everyone!",
  author: { id: "500", global_name: "SomePlayer", username: "someplayer" },
  mentions: [],
  attachments: [],
  reactions: [],
};

const ENDED_OPENING = {
  id: "2002",
  content: "Prize: 1 Bond\n1M GP = 1 entry\n\nPost your donations!",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  mentions: [],
  attachments: [],
  reactions: [],
};

function buildMessages(threadId, msgs) {
  const map = new Map();
  map.set(threadId, msgs);
  return map;
}

let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) {
    console.log("  [PASS]", label);
    pass++;
  } else {
    console.log("  [FAIL]", label);
    fail++;
  }
}

// ---- parsePrize tests ----
console.log("== parsePrize ==");
check("extracts prize line", parsePrize("Prize: 1 Old School Bond\nRate: 1M = 1 entry") === "1 Old School Bond");
check("returns null when no prize line", parsePrize("No prize here") === null);
check("handles multiline", parsePrize("Hello\nPrize: 10M GP\nStuff") === "10M GP");
check("case insensitive", parsePrize("prize: 2 Bonds") === "2 Bonds");
check("bold giving away pattern", parsePrize("We are giving away an **OSRS Bond**!") === "OSRS Bond");
check("bold giving away without article", parsePrize("giving away **10M GP**") === "10M GP");
check("Prize: line takes priority over bold", parsePrize("Prize: A Bond\ngiving away **10M GP**") === "A Bond");

// ---- parseEntryRate tests ----
console.log("\n== parseEntryRate ==");
check("1M = 1 entry returns 1", parseEntryRate("Rate: 1M GP = 1 entry") === 1);
check("2M = 1 entry returns 2", parseEntryRate("Rate: 2M GP = 1 entry") === 2);
check("1M = 2 entries returns 0.5", parseEntryRate("1M GP = 2 entries") === 0.5);
check("defaults to 1 when no pattern", parseEntryRate("No rate here") === 1);

// ---- extractEntryCountFromReactions tests ----
console.log("\n== extractEntryCountFromReactions ==");
check("1 keycap returns 1", extractEntryCountFromReactions([{ emoji: { name: "1️⃣" }, count: 1 }]) === 1);
check("2 keycap returns 2", extractEntryCountFromReactions([{ emoji: { name: "2️⃣" }, count: 1 }]) === 2);
check("bare 1 keycap returns 1", extractEntryCountFromReactions([{ emoji: { name: "1⃣" }, count: 1 }]) === 1);
check("bare 2 keycap returns 2", extractEntryCountFromReactions([{ emoji: { name: "2⃣" }, count: 1 }]) === 2);
check("empty array returns 0", extractEntryCountFromReactions([]) === 0);
check("null returns 0", extractEntryCountFromReactions(null) === 0);
check("undefined returns 0", extractEntryCountFromReactions(undefined) === 0);
check("unrelated emoji returns 0", extractEntryCountFromReactions([{ emoji: { name: "👍" }, count: 1 }]) === 0);
check("checkmark returns 0", extractEntryCountFromReactions([{ emoji: { name: "✅" }, count: 1 }]) === 0);
check("both 1 and 2 gives 3", extractEntryCountFromReactions([
  { emoji: { name: "1️⃣" }, count: 1 },
  { emoji: { name: "2️⃣" }, count: 1 },
]) === 3);
check("mixed reactions only counts keycaps", extractEntryCountFromReactions([
  { emoji: { name: "👍" }, count: 3 },
  { emoji: { name: "1️⃣" }, count: 1 },
  { emoji: { name: "🎉" }, count: 2 },
]) === 1);

// ---- parseEventForgeDateField tests ----
console.log("\n== parseEventForgeDateField ==");
const dateContent = "When: Friday, August 23, 2026 at 8:00 PM\nEnds: Saturday, September 6, 2026 at 11:59 PM";
const whenResult = parseEventForgeDateField(dateContent, "When");
check("parses When date", whenResult !== null);
check("When date month is August", whenResult && new Date(whenResult).getMonth() === 7);
const endsResult = parseEventForgeDateField(dateContent, "Ends");
check("parses Ends date", endsResult !== null);
check("returns null for missing field", parseEventForgeDateField(dateContent, "Start") === null);

const tsContent = "When: <t:1724443200:F>\nEnds: <t:1725663540>";
const tsWhen = parseEventForgeDateField(tsContent, "When");
check("parses Discord timestamp", tsWhen !== null);
const tsEnds = parseEventForgeDateField(tsContent, "Ends");
check("parses Discord timestamp without flag", tsEnds !== null);

// ---- transformGiveawayData: active round ----
console.log("\n== transformGiveawayData: active round ==");
const activeMessages = buildMessages("2001", [
  OPENING_MSG,
  SCREENSHOT_1_ENTRY,
  SCREENSHOT_2_ENTRIES,
  SCREENSHOT_NO_REACTION,
  CHAT_MSG,
]);
const activeRounds = transformGiveawayData([THREAD_ACTIVE], activeMessages);

check("1 round returned", activeRounds.length === 1);
const r = activeRounds[0];
check("round name", r.name === "BOND GIVEAWAY ROUND 2");
check("status is scheduled (active thread)", r.status === "scheduled");
check("prize parsed", r.prize === "1 Old School Bond");
check("gpPerEntry is 1", r.gpPerEntry === 1);
check("hasParsedDate is true", r.hasParsedDate === true);
check("endTime is not null", r.endTime !== null);
check("image extracted from opening", r.image === "https://cdn.example.com/banner.png");
check("2 entries (reacted posts only)", r.entries.length === 2);
check("first entry player is Vilence", r.entries[0].player === "Vilence");
check("first entry count is 1", r.entries[0].count === 1);
check("second entry player is Artolux", r.entries[1].player === "Artolux");
check("second entry count is 2", r.entries[1].count === 2);
check("totalEntries is 3", r.totalEntries === 3);
check("totalParticipants is 2", r.totalParticipants === 2);
check("gpRaised is 3", r.gpRaised === 3);
check("no winners yet", r.winners.length === 0);

// ---- transformGiveawayData: ended round with winner ----
console.log("\n== transformGiveawayData: ended round with winner ==");
const endedScreenshot = {
  id: "4001",
  content: "My donation",
  author: { id: "200", global_name: "Vilence", username: "vilence" },
  mentions: [],
  attachments: [],
  reactions: [{ emoji: { name: "2️⃣" }, count: 1 }],
};
const endedMessages = buildMessages("2002", [
  ENDED_OPENING,
  endedScreenshot,
  { ...WINNER_MSG_TROPHY, id: "4010" },
]);
const endedRounds = transformGiveawayData([THREAD_ENDED], endedMessages);

check("1 round returned", endedRounds.length === 1);
const e = endedRounds[0];
check("status is completed (archived)", e.status === "completed");
check("prize parsed", e.prize === "1 Bond");
check("totalEntries is 2", e.totalEntries === 2);
check("1 winner found", e.winners.length === 1);
check("trophy winner uses mentioned user name (capitalized)", e.winners[0].name === "Vilence");
check("winner message captured", e.winners[0].message.includes("Congratulations"));

// ---- sorting ----
console.log("\n== transformGiveawayData: sorting ==");
const bothMessages = new Map();
bothMessages.set("2001", [OPENING_MSG, SCREENSHOT_1_ENTRY]);
bothMessages.set("2002", [ENDED_OPENING]);
const sorted = transformGiveawayData([THREAD_ENDED, THREAD_ACTIVE], bothMessages);

check("active round sorts first", sorted[0].status === "scheduled");
check("ended round sorts second", sorted[1].status === "completed");

// ---- edge cases ----
console.log("\n== transformGiveawayData: edge cases ==");
check("empty input", transformGiveawayData([], new Map()).length === 0);
check("null input", transformGiveawayData(null, new Map()).length === 0);
const noMsgRounds = transformGiveawayData([THREAD_ACTIVE], new Map());
check("thread with no messages", noMsgRounds.length === 1);
check("missing messages defaults", noMsgRounds[0].totalEntries === 0);
check("missing messages prize TBA", noMsgRounds[0].prize === "TBA");
check("hasParsedDate always true for giveaways", noMsgRounds[0].hasParsedDate === true);

// ---- no reactions = no entries ----
console.log("\n== no reactions = no entries ==");
const noReactionMessages = buildMessages("2001", [
  OPENING_MSG,
  SCREENSHOT_NO_REACTION,
  CHAT_MSG,
]);
const noReactionRounds = transformGiveawayData([THREAD_ACTIVE], noReactionMessages);
check("no entries when no reactions", noReactionRounds[0].entries.length === 0);
check("totalEntries is 0", noReactionRounds[0].totalEntries === 0);

// ---- per-person cap ----
console.log("\n== per-person cap (max 2 entries) ==");
const multiPostMessages = buildMessages("2001", [
  OPENING_MSG,
  {
    id: "5001",
    content: "First donation",
    author: { id: "200", global_name: "Vilence", username: "vilence" },
    mentions: [],
    attachments: [],
    reactions: [{ emoji: { name: "1️⃣" }, count: 1 }],
  },
  {
    id: "5002",
    content: "Second donation",
    author: { id: "200", global_name: "Vilence", username: "vilence" },
    mentions: [],
    attachments: [],
    reactions: [{ emoji: { name: "2️⃣" }, count: 1 }],
  },
]);
const cappedRounds = transformGiveawayData([THREAD_ACTIVE], multiPostMessages);
check("posts by same person merge into one record", cappedRounds[0].entries.length === 1);
check("merged record totals both posts", cappedRounds[0].entries[0].count === 3);
check("totalEntries is 3", cappedRounds[0].totalEntries === 3);
check("only 1 unique participant", cappedRounds[0].totalParticipants === 1);

// ---- person at cap gets nothing from extra posts ----
console.log("\n== person at cap gets nothing from extra posts ==");
const overCapMessages = buildMessages("2001", [
  OPENING_MSG,
  {
    id: "6001",
    content: "First",
    author: { id: "200", global_name: "Vilence", username: "vilence" },
    mentions: [],
    attachments: [],
    reactions: [{ emoji: { name: "2️⃣" }, count: 1 }],
  },
  {
    id: "6002",
    content: "Another one",
    author: { id: "200", global_name: "Vilence", username: "vilence" },
    mentions: [],
    attachments: [],
    reactions: [{ emoji: { name: "1️⃣" }, count: 1 }],
  },
]);
const overCapRounds = transformGiveawayData([THREAD_ACTIVE], overCapMessages);
check("both posts merge into one record", overCapRounds[0].entries.length === 1);
check("merged count is 3 (under cap of 5)", overCapRounds[0].entries[0].count === 3);
check("totalEntries is 3", overCapRounds[0].totalEntries === 3);

// ---- reaction + manual bot entry merge for same person ----
console.log("\n== reaction + manual entry merge (case-insensitive) ==");
const mixedMergeMessages = buildMessages("2001", [
  OPENING_MSG,
  {
    id: "6101",
    content: "screenshot",
    author: { id: "300", global_name: "madewell91", username: "madewell91" },
    mentions: [],
    attachments: [],
    reactions: [{ emoji: { name: "1️⃣" }, count: 1 }],
  },
  {
    id: "6102",
    content: "",
    author: { id: "999", global_name: "Bot", username: "bot" },
    embeds: [{ title: "Entry Added", fields: [
      { name: "Player", value: "Madewell91", inline: true },
      { name: "Entries", value: "1", inline: true },
      { name: "Added by", value: "mr flsh", inline: true },
    ]}],
    mentions: [], attachments: [], reactions: [],
  },
]);
const mixedMergeRounds = transformGiveawayData([THREAD_ACTIVE], mixedMergeMessages);
check("reaction and manual entry merge into one record", mixedMergeRounds[0].entries.length === 1);
check("merged total is 2", mixedMergeRounds[0].entries[0].count === 2);
check("uses Discord display name", mixedMergeRounds[0].entries[0].player === "madewell91");
check("counts as one participant", mixedMergeRounds[0].totalParticipants === 1);

console.log("\n== manual subtract reduces reaction entry ==");
const mixedSubMessages = buildMessages("2001", [
  OPENING_MSG,
  {
    id: "6201",
    content: "screenshot",
    author: { id: "300", global_name: "madewell91", username: "madewell91" },
    mentions: [],
    attachments: [],
    reactions: [{ emoji: { name: "2️⃣" }, count: 1 }],
  },
  {
    id: "6202",
    content: "",
    author: { id: "999", global_name: "Bot", username: "bot" },
    embeds: [{ title: "Entry Removed", fields: [
      { name: "Player", value: "MADEWELL91", inline: true },
      { name: "Entries", value: "1", inline: true },
      { name: "Removed by", value: "mr flsh", inline: true },
    ]}],
    mentions: [], attachments: [], reactions: [],
  },
]);
const mixedSubRounds = transformGiveawayData([THREAD_ACTIVE], mixedSubMessages);
check("subtract applies to reaction entry (2 - 1 = 1)", mixedSubRounds[0].totalEntries === 1);
check("still one record", mixedSubRounds[0].entries.length === 1);

// ---- trophy winner detection edge cases ----
console.log("\n== trophy winner: pinned fallback (no trophy) ==");
const pinnedFallbackMessages = buildMessages("2002", [
  ENDED_OPENING,
  endedScreenshot,
  { ...WINNER_MSG_PINNED, id: "4011" },
]);
const pinnedRounds = transformGiveawayData([THREAD_ENDED], pinnedFallbackMessages);
check("pinned fallback finds 1 winner", pinnedRounds[0].winners.length === 1);
check("pinned fallback uses author name (capitalized)", pinnedRounds[0].winners[0].name === "Mr Flsh");

console.log("\n== trophy winner: text name parsing ==");
const trophyWithName = {
  id: "4012",
  content: "\u{1F3C6} jackson",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  pinned: false,
  mentions: [],
  attachments: [],
  reactions: [],
  timestamp: "2026-09-06T23:59:00Z",
};
const nameMessages = buildMessages("2002", [
  ENDED_OPENING,
  endedScreenshot,
  trophyWithName,
]);
const nameRounds = transformGiveawayData([THREAD_ENDED], nameMessages);
check("plain trophy name finds winner", nameRounds[0].winners.length === 1);
check("plain trophy name capitalized", nameRounds[0].winners[0].name === "Jackson");

const trophyWithGreeting = {
  id: "4013",
  content: "\u{1F3C6} Congratulations jackson!",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  pinned: false,
  mentions: [],
  attachments: [],
  reactions: [],
  timestamp: "2026-09-06T23:59:00Z",
};
const greetingMessages = buildMessages("2002", [
  ENDED_OPENING,
  endedScreenshot,
  trophyWithGreeting,
]);
const greetingRounds = transformGiveawayData([THREAD_ENDED], greetingMessages);
check("strips greeting, extracts name capitalized", greetingRounds[0].winners[0].name === "Jackson");

const trophyLongText = {
  id: "4014",
  content: "\u{1F3C6} Congratulations to our winner of this giveaway round!",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  pinned: false,
  mentions: [],
  attachments: [],
  reactions: [],
  timestamp: "2026-09-06T23:59:00Z",
};
const longMessages = buildMessages("2002", [
  ENDED_OPENING,
  endedScreenshot,
  trophyLongText,
]);
const longRounds = transformGiveawayData([THREAD_ENDED], longMessages);
check("long text falls back to author (capitalized)", longRounds[0].winners[0].name === "Mr Flsh");

const trophyGreetingPunct = {
  id: "4015",
  content: "\u{1F3C6} Congrats! jackson!",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  pinned: false,
  mentions: [],
  attachments: [],
  reactions: [],
  timestamp: "2026-09-06T23:59:00Z",
};
const punctMessages = buildMessages("2002", [
  ENDED_OPENING,
  endedScreenshot,
  trophyGreetingPunct,
]);
const punctRounds = transformGiveawayData([THREAD_ENDED], punctMessages);
check("strips greeting with punctuation (capitalized)", punctRounds[0].winners[0].name === "Jackson");

console.log("\n== trophy winner: both trophy and pinned in same round ==");
const bothWinnerMessages = buildMessages("2002", [
  ENDED_OPENING,
  endedScreenshot,
  { ...WINNER_MSG_TROPHY, id: "4013" },
  { ...WINNER_MSG_PINNED, id: "4014" },
]);
const bothRounds = transformGiveawayData([THREAD_ENDED], bothWinnerMessages);
check("both trophy and pinned counted", bothRounds[0].winners.length === 2);

console.log("\n== auto end-date (14-day cycle) ==");
const noDateOpening = {
  id: "2001",
  content: "Prize: 1 Bond\n1M GP = 1 entry\n\nPost your donations!",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  mentions: [],
  attachments: [],
  reactions: [],
};
const noDateMessages = buildMessages("2001", [noDateOpening]);
const noDateRounds = transformGiveawayData([THREAD_ACTIVE], noDateMessages);
check("active round without Ends gets auto end-date", noDateRounds[0].endTime !== null);
const autoStart = new Date(noDateRounds[0].startTime);
const autoEnd = new Date(noDateRounds[0].endTime);
const diffDays = Math.round((autoEnd - autoStart) / (1000 * 60 * 60 * 24));
check("auto end-date is 14 days after start", diffDays === 14);

const endedNoDate = transformGiveawayData([THREAD_ENDED], buildMessages("2002", [ENDED_OPENING]));
check("completed round without Ends keeps null end-date", endedNoDate[0].endTime === null);

const withDatesRounds = transformGiveawayData([THREAD_ACTIVE], buildMessages("2001", [OPENING_MSG]));
check("explicit Ends date not overridden by auto", withDatesRounds[0].endTime !== null);
const explicitEnd = new Date(withDatesRounds[0].endTime);
check("explicit Ends preserves parsed date", explicitEnd.getMonth() === 8);

console.log("\n== trophy winner: no winner messages ==");
const noWinnerMessages = buildMessages("2001", [
  OPENING_MSG,
  SCREENSHOT_1_ENTRY,
  CHAT_MSG,
]);
const noWinnerRounds = transformGiveawayData([THREAD_ACTIVE], noWinnerMessages);
check("no winners when no trophy or pinned", noWinnerRounds[0].winners.length === 0);

// ---- extractBotEntry tests ----
console.log("\n== extractBotEntry ==");
const botEntryMsg = {
  id: "7001",
  content: "",
  author: { id: "999", global_name: "Bot", username: "bot" },
  embeds: [{
    title: "Entry Added",
    fields: [
      { name: "Player", value: "Vilence", inline: true },
      { name: "Entries", value: "2", inline: true },
      { name: "Added by", value: "mr flsh", inline: true },
    ],
  }],
  mentions: [],
  attachments: [],
  reactions: [],
};
const be = extractBotEntry(botEntryMsg);
check("extracts bot entry", be !== null);
check("bot entry player", be && be.player === "Vilence");
check("bot entry count", be && be.count === 2);

check("returns null for no embeds", extractBotEntry({ embeds: [] }) === null);
check("returns null for wrong title", extractBotEntry({ embeds: [{ title: "Loot Drop" }] }) === null);
check("returns null for missing Player field", extractBotEntry({
  embeds: [{ title: "Entry Added", fields: [{ name: "Entries", value: "1" }] }],
}) === null);

const be1 = extractBotEntry({
  embeds: [{ title: "Entry Added", fields: [{ name: "Player", value: "TestPlayer" }] }],
});
check("defaults to 1 entry when Entries field missing", be1 && be1.count === 1);

const beCapped = extractBotEntry({
  embeds: [{ title: "Entry Added", fields: [
    { name: "Player", value: "TestPlayer" },
    { name: "Entries", value: "10" },
  ]}],
});
check("caps at MAX_ENTRIES_PER_PERSON", beCapped && beCapped.count === 5);

const beRemoved = extractBotEntry({
  embeds: [{ title: "Entry Removed", fields: [
    { name: "Player", value: "TestPlayer" },
    { name: "Removed by", value: "Leader" },
  ]}],
});
check("Entry Removed returns negative count", beRemoved && beRemoved.count === -5);
check("Entry Removed preserves player", beRemoved && beRemoved.player === "TestPlayer");

const beRemovedN = extractBotEntry({
  embeds: [{ title: "Entry Removed", fields: [
    { name: "Player", value: "TestPlayer" },
    { name: "Entries", value: "2" },
    { name: "Removed by", value: "Leader" },
  ]}],
});
check("Entry Removed with Entries field returns -N", beRemovedN && beRemovedN.count === -2);

// ---- transformGiveawayData: bot-posted entries ----
console.log("\n== transformGiveawayData: bot-posted entries ==");
const botEntryMessages = buildMessages("2001", [
  OPENING_MSG,
  botEntryMsg,
  SCREENSHOT_1_ENTRY,
]);
const botRounds = transformGiveawayData([THREAD_ACTIVE], botEntryMessages);
check("bot entry merges with same person's reaction entry", botRounds[0].entries.length === 1);
check("totalEntries includes bot entry", botRounds[0].totalEntries === 3);
check("merged person counted once", botRounds[0].totalParticipants === 1);
check("player name preserved", botRounds[0].entries[0].player === "Vilence");

console.log("\n== bot entries: accumulation (add/subtract) ==");
const botDoubleMessages = buildMessages("2001", [
  OPENING_MSG,
  {
    ...botEntryMsg,
    id: "7002",
    embeds: [{
      title: "Entry Added",
      fields: [
        { name: "Player", value: "Vilence", inline: true },
        { name: "Entries", value: "1", inline: true },
        { name: "Added by", value: "mr flsh", inline: true },
      ],
    }],
  },
  botEntryMsg,
]);
const botCapRounds = transformGiveawayData([THREAD_ACTIVE], botDoubleMessages);
check("bot entries accumulate (1 + 2 = 3)", botCapRounds[0].totalEntries === 3);
check("single entry record for accumulated player", botCapRounds[0].entries.length === 1);
check("accumulated count is 3", botCapRounds[0].entries[0].count === 3);

console.log("\n== bot entries: case insensitive dedup ==");
const botCaseMessages = buildMessages("2001", [
  OPENING_MSG,
  botEntryMsg,
  {
    ...botEntryMsg,
    id: "7003",
    embeds: [{
      title: "Entry Added",
      fields: [
        { name: "Player", value: "vilence", inline: true },
        { name: "Entries", value: "1", inline: true },
      ],
    }],
  },
]);
const botCaseRounds = transformGiveawayData([THREAD_ACTIVE], botCaseMessages);
check("case-insensitive accumulation (2 + 1 = 3)", botCaseRounds[0].totalEntries === 3);
check("single entry record for case-insensitive match", botCaseRounds[0].entries.length === 1);

console.log("\n== bot entries: subtract zeroes out player ==");
const botRemovedMessages = buildMessages("2001", [
  OPENING_MSG,
  {
    id: "7010",
    content: "",
    author: { id: "999", global_name: "Bot", username: "bot" },
    embeds: [{ title: "Entry Removed", fields: [
      { name: "Player", value: "Vilence", inline: true },
      { name: "Removed by", value: "mr flsh", inline: true },
    ]}],
    mentions: [], attachments: [], reactions: [],
  },
  botEntryMsg,
]);
const botRemovedRounds = transformGiveawayData([THREAD_ACTIVE], botRemovedMessages);
check("Entry Removed zeroes out player", botRemovedRounds[0].totalEntries === 0);
check("removed player not in entries list", botRemovedRounds[0].entries.length === 0);
check("removed player still counted as participant", botRemovedRounds[0].totalParticipants === 1);

console.log("\n== bot entries: add then subtract ==");
const addSubMessages = buildMessages("2001", [
  OPENING_MSG,
  {
    id: "7020",
    content: "",
    author: { id: "999", global_name: "Bot", username: "bot" },
    embeds: [{ title: "Entry Added", fields: [
      { name: "Player", value: "Vilence", inline: true },
      { name: "Entries", value: "2", inline: true },
      { name: "Added by", value: "mr flsh", inline: true },
    ]}],
    mentions: [], attachments: [], reactions: [],
  },
  {
    id: "7021",
    content: "",
    author: { id: "999", global_name: "Bot", username: "bot" },
    embeds: [{ title: "Entry Removed", fields: [
      { name: "Player", value: "Vilence", inline: true },
      { name: "Entries", value: "1", inline: true },
      { name: "Removed by", value: "mr flsh", inline: true },
    ]}],
    mentions: [], attachments: [], reactions: [],
  },
]);
const addSubRounds = transformGiveawayData([THREAD_ACTIVE], addSubMessages);
check("add 2 then subtract 1 = 1 entry", addSubRounds[0].totalEntries === 1);
check("player in entries list", addSubRounds[0].entries.length === 1);
check("entry count is 1", addSubRounds[0].entries[0].count === 1);

console.log("\n== bot entries: over-subtract clamps at 0 ==");
const overSubMessages = buildMessages("2001", [
  OPENING_MSG,
  {
    id: "7030",
    content: "",
    author: { id: "999", global_name: "Bot", username: "bot" },
    embeds: [{ title: "Entry Removed", fields: [
      { name: "Player", value: "Vilence", inline: true },
      { name: "Entries", value: "3", inline: true },
      { name: "Removed by", value: "mr flsh", inline: true },
    ]}],
    mentions: [], attachments: [], reactions: [],
  },
]);
const overSubRounds = transformGiveawayData([THREAD_ACTIVE], overSubMessages);
check("subtract with no prior add = 0 entries", overSubRounds[0].totalEntries === 0);
check("player not in entries list", overSubRounds[0].entries.length === 0);

console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("ALL PASS");
}
