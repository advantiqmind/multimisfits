import { transformEvents } from "./functions/api/events.js";

const fixture = [
  {
    id: "1001",
    name: "Bond Giveaway — Round 2",
    description: "Enter to win a bond!",
    scheduled_start_time: "2026-09-01T20:00:00Z",
    scheduled_end_time: "2026-09-01T22:00:00Z",
    status: 1,
    user_count: 23,
    image: null,
  },
  {
    id: "1002",
    name: "CoX Mass Night",
    description: "Chambers of Xeric mass run.",
    scheduled_start_time: "2026-08-28T20:00:00Z",
    status: 1,
    user_count: 15,
  },
  {
    id: "1003",
    name: "Bond Giveaway — Round 1",
    description: "First giveaway done!",
    scheduled_start_time: "2026-08-15T20:00:00Z",
    status: 3,
    user_count: 31,
  },
  {
    id: "1004",
    name: "ToB Learning Raid",
    description: "Learning run.",
    scheduled_start_time: "2026-08-10T19:00:00Z",
    status: 3,
    user_count: 18,
  },
  {
    id: "1005",
    name: "Canceled Event",
    description: "Should not appear.",
    scheduled_start_time: "2026-09-10T20:00:00Z",
    status: 4,
  },
  {
    id: "1006",
    name: "Active Boss Mass",
    description: "Happening now!",
    scheduled_start_time: "2020-01-01T00:00:00Z",
    status: 2,
    user_count: 40,
  },
];

const out = transformEvents(fixture);

console.log("transformed events:");
for (const ev of out) {
  console.log(`  [${ev.status.padEnd(9)}] ${ev.name.padEnd(30)} interested=${ev.interestedCount}`);
}

const ok = [];
ok.push(["canceled events filtered out", out.every((e) => e.name !== "Canceled Event")]);
ok.push(["5 events total", out.length === 5]);
ok.push(["active events sort first", out[0].status === "active"]);
ok.push(["scheduled events after active", out[1].status === "scheduled"]);
ok.push(["completed events sort last", out[out.length - 1].status === "completed"]);
ok.push(["scheduled sorted by start time (earliest first)",
  out.filter((e) => e.status === "scheduled")[0].name === "CoX Mass Night"]);
ok.push(["completed sorted by start time (latest first)",
  out.filter((e) => e.status === "completed")[0].name === "Bond Giveaway — Round 1"]);
ok.push(["interestedCount preserved", out[0].interestedCount === 40]);
ok.push(["description trimmed", out[0].description === "Happening now!"]);

ok.push(["empty input returns empty array", transformEvents([]).length === 0]);
ok.push(["null input returns empty array", transformEvents(null).length === 0]);

console.log("\nchecks:");
let pass = true;
for (const [label, cond] of ok) {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
  if (!cond) pass = false;
}
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
