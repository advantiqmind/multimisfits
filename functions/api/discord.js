// Cloudflare Pages Function  ->  /api/discord
// Discord interactions endpoint for slash commands.
// GET  = one-time command registration (visit in browser to set up)
// POST = Discord interaction handler (signature-verified)
//
// Required env:
//   DISCORD_BOT_TOKEN   (secret)
//   DISCORD_PUBLIC_KEY   (plain) - from Discord Developer Portal
//   DISCORD_GUILD_ID     (plain)
//   REFERRAL_THREAD_ID   (plain, optional) - for /referralstats

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function verifySignature(request, publicKeyHex) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const body = await request.text();

  if (!signature || !timestamp) return { valid: false, body };

  const key = await crypto.subtle.importKey(
    "raw",
    hexToUint8Array(publicKeyHex),
    { name: "Ed25519", namedCurve: "Ed25519" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "Ed25519",
    key,
    hexToUint8Array(signature),
    new TextEncoder().encode(timestamp + body)
  );

  return { valid, body };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const COMMANDS = [
  {
    name: "referralstats",
    description: "Show referral code redemption breakdown",
    type: 1,
  },
];

async function getAppId(token) {
  const res = await fetch(
    "https://discord.com/api/v10/oauth2/applications/@me",
    {
      headers: {
        Authorization: `Bot ${token}`,
        "User-Agent": "Multi-Misfits clan website",
      },
    }
  );
  if (!res.ok) return null;
  const app = await res.json();
  return app.id;
}

async function registerCommands(token, guildId) {
  const appId = await getAppId(token);
  if (!appId) return json({ error: "could not fetch app id" }, 500);

  const res = await fetch(
    `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Multi-Misfits clan website",
      },
      body: JSON.stringify(COMMANDS),
    }
  );

  const data = await res.json();
  return json({ registered: res.ok, commands: data });
}

async function handleReferralStats(interaction, token, threadId, appId) {
  const authHeaders = {
    Authorization: `Bot ${token}`,
    "User-Agent": "Multi-Misfits clan website",
  };

  const codeCounts = {};
  let total = 0;

  if (threadId) {
    const msgsRes = await fetch(
      `https://discord.com/api/v10/channels/${threadId}/messages?limit=100`,
      { headers: authHeaders }
    );
    if (msgsRes.ok) {
      const msgs = await msgsRes.json();
      for (const m of msgs) {
        if (!Array.isArray(m.embeds) || !m.embeds.length) continue;
        const fields = m.embeds[0].fields || [];
        const codeField = fields.find((f) => f.name === "Code");
        if (!codeField) continue;
        codeCounts[codeField.value] = (codeCounts[codeField.value] || 0) + 1;
        total++;
      }
    }
  }

  const entries = Object.entries(codeCounts).sort((a, b) => b[1] - a[1]);
  const breakdown = entries.length
    ? entries.map(([code, count]) => `**${code}** -- ${count}`).join("\n")
    : "No redemptions yet.";

  await fetch(
    `https://discord.com/api/v10/webhooks/${appId}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "Referral Code Stats",
            color: 0x2ecc71,
            description: breakdown,
            footer: { text: `${total} total redemptions` },
          },
        ],
      }),
    }
  );
}

export async function onRequest(context) {
  const token = context.env && context.env.DISCORD_BOT_TOKEN;
  const publicKey = context.env && context.env.DISCORD_PUBLIC_KEY;
  const guildId = context.env && context.env.DISCORD_GUILD_ID;
  const threadId = context.env && context.env.REFERRAL_THREAD_ID;

  if (context.request.method === "GET") {
    if (!token || !guildId) return json({ error: "not_configured" });
    return registerCommands(token, guildId);
  }

  if (context.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!publicKey) return new Response("Not configured", { status: 500 });

  const { valid, body } = await verifySignature(context.request, publicKey);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const interaction = JSON.parse(body);

  if (interaction.type === 1) {
    return json({ type: 1 });
  }

  if (interaction.type === 2) {
    const name = interaction.data && interaction.data.name;

    if (name === "referralstats") {
      context.waitUntil(
        handleReferralStats(interaction, token, threadId, interaction.application_id)
      );
      return json({ type: 5 });
    }

    return json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
  }

  return json({ type: 4, data: { content: "Unhandled interaction.", flags: 64 } });
}
