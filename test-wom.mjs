import { transformGroup, RANK_ORDER } from "./functions/api/wom.js";

// Fixture built from the real synced group 26075 (subset + edge cases)
const fixture = {
  name: "Multi-Misfits",
  memberships: [
    { role: "captain", player: { username: "artolux", displayName: "Artolux", exp: 43_580_000 } },
    { role: "striker", player: { username: "judon", displayName: "Judon", exp: 41_570_000 } },
    { role: "owner", player: { username: "mr flsh", displayName: "mr flsh", exp: 122_380_000 } },
    { role: "inquisitor", player: { username: "vilence", displayName: "Vilence", exp: 408_020_000 } },
    { role: "deputy_owner", player: { username: "koi ox", displayName: "koi ox", exp: 124_300_000 } },
    { role: "colonel", player: { username: "bwita", displayName: "Bwita", exp: 68_580_000 } },
    { role: "deputy_owner", player: { username: "stwidu93", displayName: "StWidu93", exp: 113_780_000 } },
    { role: "beast", player: { username: "eat my pear", displayName: "eat my pear", exp: 12_000_000 } },
    { role: "squire", player: { username: "newguy", displayName: "New Guy", exp: 900_000 } },
    { role: "colonel", player: { username: "bittykor", displayName: "bittykor", exp: 38_500_000 } },
    // edge case: a rank not in RANK_ORDER should still render, sorted last
    { role: "some_future_rank", player: { username: "mystery", displayName: "Mystery", exp: 5_000_000 } },
  ],
};

const out = transformGroup(fixture);

console.log(`memberCount: ${out.memberCount}`);
console.log("sorted roster (rank -> name -> priority -> exp):");
for (const m of out.members) {
  console.log(`  ${m.rankLabel.padEnd(14)} ${m.name.padEnd(14)} p=${String(m.priority).padStart(3)}  ${(m.exp/1e6).toFixed(1)}m`);
}

// sanity checks
const roles = out.members.map((m) => m.role);
const ok = [];
ok.push(["owner is first", roles[0] === "owner"]);
ok.push(["deputy owners before officers", roles.indexOf("deputy_owner") < roles.indexOf("colonel")]);
ok.push(["higher-exp deputy (koi ox) before lower (StWidu93)",
  out.members.filter(m=>m.role==="deputy_owner")[0].name === "koi ox"]);
ok.push(["colonel before captain", roles.indexOf("colonel") < roles.indexOf("captain")]);
ok.push(["unknown rank sorts last", roles[roles.length-1] === "some_future_rank"]);
ok.push(["beast above squire", roles.indexOf("beast") < roles.indexOf("squire")]);

console.log("\nchecks:");
let pass = true;
for (const [label, cond] of ok) { console.log(`  [${cond?"PASS":"FAIL"}] ${label}`); if(!cond) pass=false; }
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
