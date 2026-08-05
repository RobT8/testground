# 🔔➡️ Instant push (Firebase) — setup

This adds **guaranteed-instant** waking, even when the phone is **unplugged,
locked, and in deep sleep**. Without it, the app still works (it polls every few
seconds and is rock-solid on the charger), but Android's deep "Doze" power-saving
can delay an off-charger alert by a few minutes. Firebase Cloud Messaging (FCM)
is the only thing that punches straight through Doze.

**All the code is already built and wired in.** It sits dormant and harmless
until you complete the steps below — the app keeps building and working the whole
time. You do steps 1–3; I do step 4.

---

## Step 1 — Create a free Firebase project (~3 min)

1. Go to **https://console.firebase.google.com** → **Add project**.
2. Name it (e.g. `night-alert`), continue. You can **disable Google Analytics**
   (not needed). Create.

## Step 2 — Add the Android app + commit `google-services.json` (~3 min)

1. In the project, click the **Android** icon ("Add app").
2. **Android package name** — type it **exactly**:
   ```
   com.nightalert.app
   ```
   (Nickname/SHA-1 can be left blank.) Register app.
3. **Download `google-services.json`.**
4. Put that file at **`android/app/google-services.json`** in the repo and
   **commit + push** it.
   - This file is **safe to commit** — it's meant to ship inside the app.
   - Pushing it makes the build wire Firebase in automatically and produces a
     new APK with push enabled.
5. You can skip the rest of Firebase's "add the SDK" wizard — that's already done
   in the code.

## Step 3 — Get the server key and give it to me (~3 min)

The server needs a private key to send pushes.

1. In Firebase: **⚙ Project settings → Service accounts**.
2. Click **Generate new private key** → confirm → a **JSON file downloads**.
3. **⚠ This file is a SECRET — do NOT commit it to the repo.** (The repo is set
   to ignore it, but just paste its contents to me in chat, or set it yourself:
   Supabase → your project → **Edge Functions → Secrets** → add
   `FCM_SERVICE_ACCOUNT` = the whole JSON.)

## Step 4 — I deploy the sender (my part)

Once the secret is set, I deploy the **`push-alarm`** Edge Function (its code is
already in `supabase/functions/push-alarm/`). After that, raising an alert sends
an instant high-priority push to the sleeper's phone.

---

## Testing it

1. Rebuild/reinstall the APK (Actions → Build Android APK → latest artifact).
2. On Mum's phone: open the app, **Arm for tonight** (this registers her push
   token), then **unplug it and lock it**.
3. From a carer phone, press **Wake Mum up**. It should ring within a second or
   two even though it's unplugged and asleep.

---

## How it works (for reference)

- Each sleeper phone stores its FCM token in the `night_alert_devices` table when
  it arms.
- Raising an alert (from the app or web) calls the `push-alarm` function, which
  looks up the group's sleeper token(s) and sends a high-priority FCM **data**
  message.
- On the phone, `FcmService` receives it — even in Doze — and kicks the existing
  watcher to ring immediately, reusing all the alarm + auto-repeat logic.
- Polling stays as the fallback, so if a push is ever missed the phone still
  catches the alert within a few seconds (instantly on the charger).
