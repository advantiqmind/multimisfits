import { transformThreads } from "./functions/api/events.js";

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
  "empty input returns empty array",
  transformThreads([], []).length === 0,
]);
ok.push([
  "null input returns empty array",
  transformThreads(null, null).length === 0,
]);

console.log("\nchecks:");
let pass = true;
for (const [label, cond] of ok) {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
  if (!cond) pass = false;
}
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
