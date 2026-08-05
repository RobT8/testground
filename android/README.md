# 🔔 Night Alert — Android app

A native Android app for waking someone at night to check their blood sugar,
with a one-tap **"I've checked — I'm OK"** confirmation that every carer sees
instantly.

Unlike the web version, the sleeper's phone **does not need the app kept open**.
Once she taps **"Arm for tonight"**, a background watcher keeps running even when
the app is closed and the phone is locked. When any carer sends an alert, her
phone shows a **full-screen alarm on the alarm channel** — loud, looping,
vibrating, and it turns the screen on over the lock screen. Because it uses the
**alarm** sound channel, it rings **even on silent and Do Not Disturb**, just
like the built-in alarm clock.

It shares the **same Supabase backend** as the web app, so carers can use either
the web app or this app — everyone sees the same alerts.

---

## What you get

- **Carer phones:** a big **"Wake Mum up"** button, live status, and the
  confirmation with time + note.
- **Mum's phone:** tap **"Arm for tonight"** once, then lock it and sleep. It
  rings loudly when needed and shows one giant check-in button.
- **Multiple carers, one alarm:** simultaneous alerts still ring only once; once
  she confirms, everyone sees it.

---

## 🛠 How to build the app (no Android Studio needed)

The app is built for you automatically in the cloud by **GitHub Actions**. You
just need to set two config values and download the finished APK.

### 1. Set your Supabase keys

These are the **same** values as the web app. If you already set up Supabase for
the web version, reuse them — everything shares one backend.

Open **`android/app/src/main/java/com/nightalert/app/Config.kt`** and fill in:

```kotlin
const val SUPABASE_URL = "https://abcdxyz.supabase.co"
const val SUPABASE_ANON_KEY = "eyJhbGciOi..."
const val SLEEPER_NAME = "Mum"
```

(If you haven't set up Supabase yet: follow steps 1–2 of the **web app README**
in the `diabetes-alert/` folder — create the project and run `supabase-schema.sql`.)

### 2. Let GitHub build the APK

Every time you push a change to the `android/` folder, GitHub Actions builds the
app. To get the file:

1. Commit your `Config.kt` change and push.
2. On GitHub, open the **Actions** tab → click the latest **"Build Android APK"** run.
3. When it finishes (green tick), scroll to **Artifacts** and download
   **`night-alert-apk`**. Inside is **`app-debug.apk`** — that's the app.

> You can also trigger a build manually from the Actions tab
> ("Run workflow" on **Build Android APK**).

### 3. Install it on each phone

Send `app-debug.apk` to each phone (email, Google Drive, USB…). On each phone:

1. Open the APK. Android will ask to allow installing from this source —
   **allow it** (Settings may prompt for "Install unknown apps").
2. Open **Night Alert**, type **your name** and the **same family group code**
   on every phone, then choose the role for that phone
   (**Mum's phone** or **A carer's phone**).

---

## 🌙 Using it

**On Mum's phone (once):**
- Open the app → **Arm for tonight**. Grant the two prompts it shows:
  - **Notifications** — needed to show the alarm.
  - **Battery / "Allow always"** — so Android doesn't shut the watcher down.
- Then lock the phone and sleep. It says **"Listening…"**.
- Tip: keep it on the charger when you can — that makes it 100% instant. Off the
  charger it still works, just occasionally a little slower (see below).

**Any carer:**
- Open the app → **Wake Mum up**. Her phone rings within a few seconds.

**Mum:**
- The screen lights up and rings. She taps **"I've checked — I'm OK"** (or a
  quick note). The alarm stops, and all carers see **✅ checked in**.

---

## ⚙️ Reliability notes (honest version)

- **On the charger:** rock solid and near-instant. Charging disables Android's
  deep power-saving, so the watcher polls continuously.
- **Off the charger:** Android's "Doze" mode can briefly pause background network
  when the phone is unplugged and hasn't moved for a while. The app adds two
  safeguards — a **battery-optimization exemption** (granted when you arm) and a
  **wake-up heartbeat every ~9 minutes** — so worst-case delay is small. For a
  bedside phone this is very reliable.
- **Want guaranteed-instant even in deep Doze off-charger?** That needs Firebase
  Cloud Messaging (a high-priority push). It's the one thing that always punches
  through Doze. I can add it as an upgrade — it needs a free Firebase project and
  a small server function. Ask if you'd like it.
- **Aggressive phones (Xiaomi, some Samsung/Oppo/Huawei):** these sometimes kill
  background apps hard. If so, add Night Alert to the phone's "protected"/
  "auto-start" app list (see dontkillmyapp.com for your brand). On stock Android
  / Pixel this isn't needed.

---

## 🔒 Privacy

Same as the web app: no accounts, no health data stored — only "an alert was
raised" and "checked in at 3:14am, Took medication". Access is gated by your
**group code**, so choose one only your family knows. The Supabase anon key is
safe to ship in the app.

---

## Files

| File | What it is |
|------|-----------|
| `app/src/main/java/com/nightalert/app/Config.kt` | **You edit this** — Supabase keys |
| `app/src/main/java/com/nightalert/app/MainActivity.kt` | Setup + carer/sleeper screens |
| `AlarmService.kt` | Background watcher (runs when app is closed) |
| `AlarmActivity.kt` | Full-screen wake-up + check-in screen |
| `AlarmPlayer.kt` | The loud looping alarm sound + vibration |
| `Supa.kt` | Talks to the Supabase backend |
| `../.github/workflows/android-build.yml` | Cloud build that produces the APK |

---

## Publishing to the Play Store (optional, later)

This debug APK is for sideloading onto your family's phones — perfect for
private use. If you ever want a proper installed app via the Play Store, that
needs a signed release build and a Google Play developer account (~$25 one-off).
Ask and I'll set up the release signing.
