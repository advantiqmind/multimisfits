import { parseSpotlight } from "./functions/api/spotlight.js";

const messages = [
  {
    id: "1", timestamp: "2026-08-25T20:00:00Z",
    content: "Twisted bow drop at CoX!",
    author: { id: "123", username: "mr flsh", global_name: "mr flsh" },
    attachments: [
      { url: "https://cdn.discordapp.com/attachments/123/456/tbow.png", content_type: "image/png" },
    ],
    embeds: [],
  },
  {
    id: "2", timestamp: "2026-08-24T18:00:00Z",
    content: "Nice kill",
    author: { id: "456", username: "Artolux" },
    attachments: [
      { url: "https://cdn.discordapp.com/attachments/123/789/kill.png", content_type: "image/png" },
    ],
    embeds: [],
  },
];

const noImageMessages = [
  {
    id: "3", timestamp: "2026-08-24T10:00:00Z",
    content: "Just a text message",
    author: { id: "789", username: "SomeGuy" },
    attachments: [],
    embeds: [],
  },
];

const embedImageMessages = [
  {
    id: "4", timestamp: "2026-08-24T08:00:00Z",
    content: "Check this out",
    author: { id: "111", username: "StWidu93" },
    attachments: [],
    embeds: [{ image: { url: "https://cdn.example.com/embed.png" } }],
  },
];

const discordGarbageMessages = [
  {
    id: "5", timestamp: "2026-08-24T06:00:00Z",
    content: "<:custom:123456> Look at this <@789> drop! @everyone",
    author: { id: "222", username: "Vilence", global_name: "Vilence" },
    attachments: [
      { url: "https://cdn.discordapp.com/attachments/1/2/drop.jpg", content_type: "image/jpeg" },
    ],
    embeds: [],
  },
];

console.log("== spotlight tests ==");

const checks = [
  ["picks first message with image", (() => {
    var r = parseSpotlight(messages);
    return r && r.image === "https://cdn.discordapp.com/attachments/123/456/tbow.png";
  })()],

  ["extracts caption from content", (() => {
    var r = parseSpotlight(messages);
    return r && r.caption === "Twisted bow drop at CoX!";
  })()],

  ["extracts author global_name", (() => {
    var r = parseSpotlight(messages);
    return r && r.author === "mr flsh";
  })()],

  ["extracts timestamp", (() => {
    var r = parseSpotlight(messages);
    return r && r.timestamp === "2026-08-25T20:00:00Z";
  })()],

  ["skips messages without images", (() => {
    var r = parseSpotlight(noImageMessages);
    return r === null;
  })()],

  ["finds image in embed fallback", (() => {
    var r = parseSpotlight(embedImageMessages);
    return r && r.image === "https://cdn.example.com/embed.png";
  })()],

  ["strips Discord tokens from caption", (() => {
    var r = parseSpotlight(discordGarbageMessages);
    return r && !r.caption.includes("<:") && !r.caption.includes("<@") && !r.caption.includes("@everyone");
  })()],

  ["handles empty array", parseSpotlight([]) === null],
  ["handles null input", parseSpotlight(null) === null],

  ["falls back to username when no global_name", (() => {
    var r = parseSpotlight([messages[1]]);
    return r && r.author === "Artolux";
  })()],
];

let pass = true;
for (const [label, cond] of checks) {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}`);
  if (!cond) pass = false;
}
console.log(pass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(pass ? 0 : 1);
