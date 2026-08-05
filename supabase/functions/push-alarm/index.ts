// ============================================================================
//  push-alarm — Supabase Edge Function
//
//  Called when a carer raises an alert. Looks up the sleeper's phone push
//  token(s) for the group and sends a HIGH-PRIORITY Firebase Cloud Messaging
//  data message, which wakes the phone even in deep Doze (unplugged, locked,
//  asleep) — the one thing polling can't guarantee off-charger.
//
//  Requires one secret to be set on the project:
//    FCM_SERVICE_ACCOUNT = the full JSON of a Firebase service-account key.
//  (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return b64url(s);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  return await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

// deno-lint-ignore no-explicit-any
async function getAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64urlBytes(new Uint8Array(sig))}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("token exchange failed: " + JSON.stringify(data));
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { group_id } = await req.json().catch(() => ({}));
    if (!group_id) return json({ error: "group_id required" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    if (!saRaw) return json({ error: "FCM_SERVICE_ACCOUNT secret not set" }, 500);
    const sa = JSON.parse(saRaw);

    // Which phones are the sleepers in this group?
    const devRes = await fetch(
      `${SUPABASE_URL}/rest/v1/night_alert_devices?group_id=eq.${encodeURIComponent(group_id)}&role=eq.sleeper&select=token`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
    );
    const devices = await devRes.json();
    const tokens: string[] = Array.isArray(devices)
      ? devices.map((d: { token: string }) => d.token).filter(Boolean)
      : [];
    if (tokens.length === 0) return json({ sent: 0, note: "no sleeper devices registered" });

    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    let sent = 0;
    const stale: string[] = [];
    for (const token of tokens) {
      const msg = {
        message: {
          token,
          data: { type: "alarm", group_id: String(group_id) },
          android: { priority: "high" },
        },
      };
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
      if (r.ok) {
        sent++;
      } else {
        const errText = await r.text();
        if (errText.includes("UNREGISTERED") || errText.includes("NOT_FOUND")) stale.push(token);
      }
    }

    // Drop tokens FCM says are dead, so the table stays clean.
    for (const t of stale) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/night_alert_devices?token=eq.${encodeURIComponent(t)}`,
        { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
      );
    }

    return json({ sent, stale: stale.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
