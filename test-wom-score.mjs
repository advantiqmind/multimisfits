import { parseScoringConfig, scorePlayer, buildLeaderboard } from "./functions/api/wom-score.js";

let pass = 0, fail = 0;
function check(label, val) {
  if (val) { pass++; console.log("  [PASS]", label); }
  else { fail++; console.error("  [FAIL]", label); }
}

console.log("--- parseScoringConfig ---");

const clues = parseScoringConfig("Scoring: clues");
check("clues preset recognized", clues && clues.preset === "clues");
check("clues has beginner weight", clues && clues.weights.clue_scrolls_beginner === 1);
check("clues has easy weight", clues && clues.weights.clue_scrolls_easy === 2);
check("clues has medium weight", clues && clues.weights.clue_scrolls_medium === 5);
check("clues has hard weight", clues && clues.weights.clue_scrolls_hard === 10);
check("clues has elite weight", clues && clues.weights.clue_scrolls_elite === 20);
check("clues has master weight", clues && clues.weights.clue_scrolls_master === 35);

const bossing = parseScoringConfig("Scoring: bossing");
check("bossing preset recognized", bossing && bossing.preset === "bossing");
check("bossing has zulrah", bossing && bossing.weights.zulrah === 1);
check("bossing has chambers_of_xeric", bossing && bossing.weights.chambers_of_xeric === 1);

const skilling = parseScoringConfig("Scoring: skilling");
check("skilling preset recognized", skilling && skilling.preset === "skilling");
check("skilling has mining", skilling && skilling.weights.mining === 1);
check("skilling has agility", skilling && skilling.weights.agility === 1);

const custom = parseScoringConfig("Scoring: mining=3, smithing=2");
check("custom weights parsed", custom && custom.preset === null);
check("custom mining=3", custom && custom.weights.mining === 3);
check("custom smithing=2", custom && custom.weights.smithing === 2);

const singleSkill = parseScoringConfig("Scoring: slayer");
check("single skill default weight 1", singleSkill && singleSkill.weights.slayer === 1);

const singleBoss = parseScoringConfig("Scoring: chambers_of_xeric");
check("single boss default weight 1", singleBoss && singleBoss.weights.chambers_of_xeric === 1);

const multiMetric = parseScoringConfig("Scoring: chambers_of_xeric, theatre_of_blood=5");
check("multi metric parsed", multiMetric && Object.keys(multiMetric.weights).length === 2);
check("multi metric default weight", multiMetric && multiMetric.weights.chambers_of_xeric === 1);
check("multi metric custom weight", multiMetric && multiMetric.weights.theatre_of_blood === 5);

const noScoring = parseScoringConfig("This event has no scoring line");
check("no scoring line returns null", noScoring === null);

const invalid = parseScoringConfig("Scoring: notarealmetric");
check("invalid metric returns null", invalid === null);

const embedded = parseScoringConfig("When: September 25\nScoring: clues\nEnds: September 28");
check("scoring in middle of content", embedded && embedded.preset === "clues");

const caseInsensitive = parseScoringConfig("Scoring: Clues");
check("case insensitive preset", caseInsensitive && caseInsensitive.preset === "clues");

const clueMetric = parseScoringConfig("Scoring: clue_scrolls_hard=10, clue_scrolls_master=35");
check("clue metrics directly", clueMetric && clueMetric.weights.clue_scrolls_hard === 10);

console.log("\n--- scorePlayer ---");

const playerData = [
  { metric: "clue_scrolls_beginner", gained: 5, start: 10, end: 15 },
  { metric: "clue_scrolls_easy", gained: 3, start: 20, end: 23 },
  { metric: "clue_scrolls_hard", gained: 2, start: 50, end: 52 },
  { metric: "clue_scrolls_master", gained: 1, start: 5, end: 6 },
  { metric: "overall", gained: 500000, start: 100000, end: 600000 },
];

const clueWeights = parseScoringConfig("Scoring: clues").weights;
const scored = scorePlayer(playerData, clueWeights);
check("total points calculated", scored.totalPoints === 5*1 + 3*2 + 2*10 + 1*35);
check("breakdown has beginner", scored.breakdown.clue_scrolls_beginner.gained === 5);
check("breakdown has points", scored.breakdown.clue_scrolls_beginner.points === 5);
check("overall not included", !scored.breakdown.overall);

const zeroGains = scorePlayer([
  { metric: "clue_scrolls_hard", gained: 0, start: 50, end: 50 },
], clueWeights);
check("zero gains ignored", zeroGains.totalPoints === 0);

console.log("\n--- buildLeaderboard ---");

const womData = [
  {
    player: { displayName: "Mr FISH", username: "mr fish" },
    data: [
      { metric: "clue_scrolls_hard", gained: 10, start: 0, end: 10 },
      { metric: "clue_scrolls_master", gained: 2, start: 0, end: 2 },
    ],
  },
  {
    player: { displayName: "Koi Ox", username: "koi ox" },
    data: [
      { metric: "clue_scrolls_hard", gained: 5, start: 0, end: 5 },
      { metric: "clue_scrolls_easy", gained: 20, start: 0, end: 20 },
    ],
  },
  {
    player: { displayName: "Noob", username: "noob" },
    data: [
      { metric: "clue_scrolls_hard", gained: 0, start: 0, end: 0 },
    ],
  },
];

const lb = buildLeaderboard(womData, clueWeights, null);
check("2 players with gains (Noob excluded)", lb.length === 2);
check("Mr FISH first (100+70=170 pts)", lb[0].player === "Mr FISH" && lb[0].points === 170);
check("Koi Ox second (50+40=90 pts)", lb[1].player === "Koi Ox" && lb[1].points === 90);
check("ranks assigned", lb[0].rank === 1 && lb[1].rank === 2);
check("breakdown included", Object.keys(lb[0].breakdown).length === 2);

const filtered = buildLeaderboard(womData, clueWeights, ["Mr FISH"]);
check("participant filter works", filtered.length === 1);
check("filtered to Mr FISH", filtered[0].player === "Mr FISH");

const filteredCI = buildLeaderboard(womData, clueWeights, ["mr fish"]);
check("participant filter case insensitive", filteredCI.length === 1);

const empty = buildLeaderboard([], clueWeights, null);
check("empty wom data", empty.length === 0);

console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log("ALL PASS");
