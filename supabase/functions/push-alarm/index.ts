// push-alarm — Supabase Edge Function.
// type "alarm" (default): high-priority FCM data message to the group's sleeper
//   phone(s) to wake them even in deep Doze.
// type "confirmed": notification ping to the group's carer phone(s) so they hear
//   the check-in without watching the app.
// The Firebase service-account JSON is read from the app_secrets table (only the
// service role can read it). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function b64url(input: string): string {
  return btoa(input).split("+").join("-").split("/").join("_").split("=").join("");
}
function b64urlBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return b64url(s);
}

async function importKey(pem: string): Promise<CryptoKey> {
  const compact = pem
    .split("-----BEGIN PRIVATE KEY-----").join("")
    .split("-----END PRIVATE KEY-----").join("")
    .split("\n").join("").split("\r").join("").split(" ").join("");
  const der = Uint8Array.from(atob(compact), (c) => c.charCodeAt(0));
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
  const unsigned = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(claim));
  const key = await importKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + "." + b64urlBytes(new Uint8Array(sig));

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("token exchange failed: " + JSON.stringify(data));
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const payload = await req.json().catch(() => ({}));
    const groupId = payload.group_id;
    const kind = payload.type === "confirmed" ? "confirmed" : "alarm";
    const role = kind === "confirmed" ? "carer" : "sleeper";
    if (!groupId) return jsonResp({ error: "group_id required" }, 400);

    const base = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const svcHeaders = { apikey: service, Authorization: "Bearer " + service } as Record<string, string>;

    const secRes = await fetch(
      base + "/rest/v1/app_secrets?name=eq.fcm_service_account&select=value",
      { headers: svcHeaders },
    );
    const secRows = await secRes.json();
    const saRaw = Array.isArray(secRows) && secRows[0] ? secRows[0].value : null;
    if (!saRaw) return jsonResp({ error: "FCM service account not configured" }, 500);
    const sa = JSON.parse(saRaw);

    const devRes = await fetch(
      base + "/rest/v1/night_alert_devices?group_id=eq." + encodeURIComponent(groupId) +
        "&role=eq." + role + "&select=token",
      { headers: svcHeaders },
    );
    const devices = await devRes.json();
    const tokens: string[] = Array.isArray(devices)
      ? devices.map((d: { token: string }) => d.token).filter(Boolean)
      : [];
    if (tokens.length === 0) return jsonResp({ sent: 0, note: "no " + role + " devices" });

    const accessToken = await getAccessToken(sa);
    const endpoint = "https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send";

    let sent = 0;
    const stale: string[] = [];
    for (const token of tokens) {
      let msg;
      if (kind === "confirmed") {
        const who = (payload.by && String(payload.by)) || "They";
        const note = payload.note ? ": " + payload.note : "";
        msg = {
          message: {
            token,
            notification: { title: who + " has checked in", body: "Confirmed" + note + " — you can rest." },
            data: { type: "confirmed", group_id: String(groupId) },
            android: { priority: "high", notification: { sound: "default", channel_id: "confirm" } },
          },
        };
      } else {
        msg = {
          message: {
            token,
            data: { type: "alarm", group_id: String(groupId) },
            android: { priority: "high" },
          },
        };
      }
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
      if (r.ok) {
        sent++;
      } else {
        const errText = await r.text();
        if (errText.includes("UNREGISTERED") || errText.includes("NOT_FOUND")) stale.push(token);
      }
    }

    for (const t of stale) {
      await fetch(base + "/rest/v1/night_alert_devices?token=eq." + encodeURIComponent(t), {
        method: "DELETE",
        headers: svcHeaders,
      });
    }

    return jsonResp({ sent, stale: stale.length });
  } catch (e) {
    return jsonResp({ error: String(e) }, 500);
  }
});
