import {
  transformGiveawayData,
  parsePrize,
  parseEntryRate,
  extractEntryCount,
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

const SCREENSHOT_MSG = {
  id: "3001",
  content: "Here is my donation screenshot",
  author: { id: "200", global_name: "Vilence", username: "vilence" },
  mentions: [],
  attachments: [{ url: "https://cdn.example.com/screenshot.png", content_type: "image/png" }],
  reactions: [],
};

const CONFIRMED_ENTRY = {
  id: "3002",
  content: "5",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  mentions: [],
  attachments: [],
  message_reference: { message_id: "3001" },
  reactions: [{ emoji: { name: "✅" }, count: 1 }],
};

const UNCONFIRMED_ENTRY = {
  id: "3003",
  content: "3",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  mentions: [],
  attachments: [],
  message_reference: { message_id: "3001" },
  reactions: [],
};

const SCREENSHOT_MSG_2 = {
  id: "3004",
  content: "My donation",
  author: { id: "300", global_name: "Artolux", username: "artolux" },
  mentions: [],
  attachments: [],
  reactions: [],
};

const CONFIRMED_ENTRY_2 = {
  id: "3005",
  content: "2 entries",
  author: { id: "100", global_name: "mr flsh", username: "mrflsh" },
  mentions: [],
  attachments: [],
  message_reference: { message_id: "3004" },
  reactions: [{ emoji: { name: "✅" }, count: 1 }],
};

const WINNER_MSG = {
  id: "3010",
  content: "Congratulations Vilence! You won the bond!",
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
  author: { id: "400", global_name: "Bwita", username: "bwita" },
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

// ---- parseEntryRate tests ----
console.log("\n== parseEntryRate ==");
check("1M = 1 entry returns 1", parseEntryRate("Rate: 1M GP = 1 entry") === 1);
check("2M = 1 entry returns 2", parseEntryRate("Rate: 2M GP = 1 entry") === 2);
check("1M = 2 entries returns 0.5", parseEntryRate("1M GP = 2 entries") === 0.5);
check("defaults to 1 when no pattern", parseEntryRate("No rate here") === 1);

// ---- extractEntryCount tests ----
console.log("\n== extractEntryCount ==");
check("just a number", extractEntryCount("5") === 5);
check("number with entries suffix", extractEntryCount("3 entries") === 3);
check("number with entry suffix", extractEntryCount("1 entry") === 1);
check("entries: prefix", extractEntryCount("entries: 12") === 12);
check("number with x suffix", extractEntryCount("7x") === 7);
check("number with ducks suffix", extractEntryCount("4 ducks") === 4);
check("returns null for text", extractEntryCount("good luck") === null);
check("returns null for empty", extractEntryCount("") === null);
check("returns null for null", extractEntryCount(null) === null);
check("returns null for mixed text", extractEntryCount("I donated 5M") === null);

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

// ---- transformGiveawayData tests ----
console.log("\n== transformGiveawayData: active round ==");
const activeMessages = buildMessages("2001", [
  OPENING_MSG,
  SCREENSHOT_MSG,
  CONFIRMED_ENTRY,
  UNCONFIRMED_ENTRY,
  SCREENSHOT_MSG_2,
  CONFIRMED_ENTRY_2,
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
check("2 confirmed entries", r.entries.length === 2);
check("first entry player is Vilence", r.entries[0].player === "Vilence");
check("first entry count is 5", r.entries[0].count === 5);
check("second entry player is Artolux", r.entries[1].player === "Artolux");
check("second entry count is 2", r.entries[1].count === 2);
check("totalEntries is 7", r.totalEntries === 7);
check("totalParticipants is 2", r.totalParticipants === 2);
check("gpRaised is 7", r.gpRaised === 7);
check("no winners yet", r.winners.length === 0);

console.log("\n== transformGiveawayData: ended round with winner ==");
const endedMessages = buildMessages("2002", [
  ENDED_OPENING,
  { ...SCREENSHOT_MSG, id: "4001" },
  {
    ...CONFIRMED_ENTRY,
    id: "4002",
    content: "3",
    message_reference: { message_id: "4001" },
  },
  { ...WINNER_MSG, id: "4010" },
]);
const endedRounds = transformGiveawayData([THREAD_ENDED], endedMessages);

check("1 round returned", endedRounds.length === 1);
const e = endedRounds[0];
check("status is completed (archived)", e.status === "completed");
check("prize parsed", e.prize === "1 Bond");
check("totalEntries is 3", e.totalEntries === 3);
check("1 winner found", e.winners.length === 1);
check("winner name is mr flsh", e.winners[0].name === "mr flsh");
check("winner message captured", e.winners[0].message.includes("Congratulations"));

console.log("\n== transformGiveawayData: sorting ==");
const bothMessages = new Map();
bothMessages.set("2001", [OPENING_MSG, SCREENSHOT_MSG, CONFIRMED_ENTRY]);
bothMessages.set("2002", [ENDED_OPENING]);
const sorted = transformGiveawayData([THREAD_ENDED, THREAD_ACTIVE], bothMessages);

check("active round sorts first", sorted[0].status === "scheduled");
check("ended round sorts second", sorted[1].status === "completed");

console.log("\n== transformGiveawayData: edge cases ==");
check("empty input", transformGiveawayData([], new Map()).length === 0);
check("null input", transformGiveawayData(null, new Map()).length === 0);
const noMsgRounds = transformGiveawayData([THREAD_ACTIVE], new Map());
check("thread with no messages", noMsgRounds.length === 1);
check("missing messages defaults", noMsgRounds[0].totalEntries === 0);
check("missing messages prize TBA", noMsgRounds[0].prize === "TBA");

console.log("\n== unconfirmed entries skipped ==");
const unconfirmedOnly = buildMessages("2001", [
  OPENING_MSG,
  SCREENSHOT_MSG,
  UNCONFIRMED_ENTRY,
]);
const unconfirmedRounds = transformGiveawayData([THREAD_ACTIVE], unconfirmedOnly);
check("no confirmed entries", unconfirmedRounds[0].entries.length === 0);
check("totalEntries is 0", unconfirmedRounds[0].totalEntries === 0);

console.log("\n== non-reply messages ignored ==");
const nonReplyEntry = {
  ...CONFIRMED_ENTRY,
  id: "9999",
  message_reference: undefined,
};
const nonReplyMessages = buildMessages("2001", [OPENING_MSG, nonReplyEntry]);
const nonReplyRounds = transformGiveawayData([THREAD_ACTIVE], nonReplyMessages);
check("non-reply entry ignored", nonReplyRounds[0].entries.length === 0);

console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("ALL PASS");
}
