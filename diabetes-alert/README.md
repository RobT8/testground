# 🔔 Diabetes Night Alert

A tiny web app (PWA) for waking someone at night to check their blood sugar,
with a one-tap **"I've checked — I'm OK"** confirmation that everyone in the
family sees instantly.

Built for this exact situation:

- **Carers** (you + siblings/family) on **Android** — send the wake-up alert
  and watch for the reply.
- **The sleeper** (e.g. Mum) on **iPhone** — her phone rings loudly and shows
  one big check-in button.
- **Multiple carers, one alarm.** If two people press "wake her up" at the same
  time, she still only hears **one** alarm — and once she checks in, **all**
  carers see it, so nobody sends a duplicate.

It works on **any phone with a browser** (Android + iPhone) — no app store.

---

## ⭐ The 15-minute setup

You only do steps 1–3 once. Then everyone just opens a link.

### 1. Create a free Supabase backend

Supabase is the free service that lets the phones talk to each other in real time.

1. Go to **https://supabase.com** → sign up (free) → **New project**.
   - Give it a name (e.g. `night-alert`) and a database password (save it somewhere).
   - Pick the region closest to you. Wait ~2 minutes for it to finish setting up.
2. In the left sidebar: **SQL Editor** → **New query**.
3. Open the file **`supabase-schema.sql`** from this folder, copy **all** of it,
   paste it into the editor, and click **Run**. You should see "Success".
4. In the left sidebar: **Project Settings** (gear icon) → **API**. Copy these two values:
   - **Project URL** — looks like `https://abcdxyz.supabase.co`
   - **anon / public** key — a long string starting with `eyJ...`

### 2. Paste your keys into the app

Open **`config.js`** and fill in the two values you just copied:

```js
window.APP_CONFIG = {
  SUPABASE_URL:      "https://abcdxyz.supabase.co",   // <- your Project URL
  SUPABASE_ANON_KEY: "eyJhbGciOi...",                 // <- your anon key
  SLEEPER_NAME: "Mum",                                // whatever you call her
};
```

> The anon key is **meant** to live in front-end code — that's what it's for.
> Your alerts stay private because they're locked to your **group code** (below).

### 3. Put the app online (free) with GitHub Pages

The two phones need a web link (`https://…`) to open. The easiest free way:

1. Create a new GitHub repo (e.g. `night-alert`) and upload the contents of this
   **`diabetes-alert/`** folder to it (so `index.html` is at the top of the repo).
2. In the repo: **Settings** → **Pages** → under "Build and deployment",
   set **Source = Deploy from a branch**, branch **main** / folder **/ (root)**, Save.
3. After a minute, GitHub gives you a link like
   `https://yourname.github.io/night-alert/`. **That's your app link.** 🎉

> Any HTTPS host works (Netlify, Vercel, Cloudflare Pages…). HTTPS is required
> for the alarm sound, "keep screen on", and Add-to-Home-Screen to work.

### 4. Everyone opens the link once

Send the link to every carer and to Mum. On each phone:

- Open the link, type **your name** and the **same family group code**
  (e.g. `SMITH-NIGHT` — make one up, everyone types it identically).
- Choose the role for that phone: **A carer's phone** or **Mum's phone**.
- **Add it to the Home Screen** so it opens like a real app:
  - **iPhone (Safari):** Share button → **Add to Home Screen**.
  - **Android (Chrome):** menu (⋮) → **Add to Home screen / Install app**.

Done. 🎉

---

## 🌙 How you use it each night

**On Mum's iPhone, before bed:**
1. Open the app → tap **"Arm for tonight"** (this unlocks the loud sound and
   keeps the screen on).
2. Turn the volume up, put the phone **on the charger**, and leave the app
   open. It now says *"Listening…"* — she can put it down.

**When you need to wake her (any carer):**
- Open the app → tap **🔔 Wake Mum up**. Her phone starts blaring immediately.
- You'll see *"Mum is being woken…"*.

**Mum:**
- Her screen lights up red and rings. She taps **"I've checked — I'm OK"**
  (or one of the quick buttons: *Checked levels / Took meds / Ate something*).
- The alarm stops and she sees *"Thank you, go back to sleep."*

**All carers** instantly see **✅ Mum has checked in** with the time and note —
so nobody gets up or sends another alert.

---

## ❗ Important: how to make the alarm reliable

A website can only play a **loud, custom, looping** alarm while its screen is
open — Apple doesn't allow a web page to blast sound from the fully-closed
background. So for the wake-up to be dependable on Mum's iPhone:

- ✅ **Keep the app open** on her phone at night (don't switch to another app).
- ✅ **Keep it on the charger** — "Arm for tonight" keeps the screen on, which
  uses battery.
- ✅ **Volume up.** The alarm uses the Web Audio system, which normally plays
  even on silent, but turning the ringer up is the safe bet.
- ✅ Tap **"Arm for tonight"** every evening (this is the tap that unlocks sound).

Treat Mum's phone like a **bedside alarm clock** that stays plugged in and awake.
Tap **"Test the alarm sound"** together the first night so she knows what to expect.

> Want it to ring even with the screen off / phone locked? That needs a native
> installed app (Apple limitation for websites). This PWA is the best you can do
> without going through the App Store — and for a plugged-in bedside phone it
> works well. See "Going further" below.

---

## 🔒 Privacy & security

- There's no sign-up and no personal health data stored — only "an alert was
  raised" and "checked in at 3:14am, "Took medication"".
- Access is gated by your **group code**, which acts as a shared password.
  Choose something not obvious (not just `MUM`). Anyone who knows your Supabase
  key **and** your group code could see your alerts, so keep the code in the family.
- Want stronger security later? The `supabase-schema.sql` file has a note on
  swapping the open policies for proper logins.

---

## 🧰 Files in this folder

| File | What it is |
|------|------------|
| `index.html` | The app's screens |
| `styles.css` | Styling (big buttons, night-friendly) |
| `app.js` | All the logic (alerts, alarm sound, realtime sync) |
| `config.js` | **You edit this** — your Supabase keys |
| `supabase-schema.sql` | **You run this once** in Supabase |
| `manifest.webmanifest`, `service-worker.js`, `icons/` | Make it installable like an app |

---

## 🚀 Going further (optional, later)

- **Wake even when the screen is off:** add Web Push notifications (works on
  iOS 16.4+ for home-screen apps) via a Supabase Edge Function, or wrap this in
  a lightweight native shell (Capacitor) to publish a real installed app with a
  true bypass-silent alarm.
- **Multiple sleepers / more people:** the group model already supports as many
  carers as you like. For multiple patients, use a different group code each.
- **Auto-repeat:** re-ring every few minutes until confirmed.

If you'd like any of these, just ask.
