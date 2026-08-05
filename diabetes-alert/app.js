/* ============================================================================
   Diabetes Night Alert — app logic (vanilla JS, no framework)

   Flow
   ----
   • Everyone joins the same GROUP (a shared code).
   • A CARER presses "Wake Mum up"  ->  creates one active alert for the group.
     - If an alert is already active, pressing again does NOT create a second
       alarm; it just adds the carer's name so Mum only ever hears ONE alarm.
   • Mum's phone (SLEEPER), once "armed", rings loudly the moment an alert
     appears (via Supabase Realtime), and shows a big check-in button.
   • Mum confirms -> the alert becomes "confirmed" -> every carer instantly
     sees who/what/when. No more alarms for that alert.
   ============================================================================ */

(function () {
  "use strict";

  // ---- Config & guards ------------------------------------------------------
  const CFG = window.APP_CONFIG || {};
  const SLEEPER_NAME = CFG.SLEEPER_NAME || "Mum";
  document.querySelectorAll("[data-sleeper-name]").forEach(el => (el.textContent = SLEEPER_NAME));
  // "Mum's phone" label
  document.querySelectorAll('.role-title[data-sleeper-name]').forEach(el => (el.textContent = SLEEPER_NAME + "'s phone"));

  if (!window.supabase || !CFG.SUPABASE_URL || CFG.SUPABASE_URL.startsWith("PASTE_")) {
    showFatal(
      "Not configured yet.<br><br>Open <b>config.js</b> and paste in your Supabase URL and anon key, " +
      "then run the SQL in <b>supabase-schema.sql</b>.<br><br>See the README for step-by-step help."
    );
    return;
  }

  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 5 } },
  });

  // ---- Small helpers --------------------------------------------------------
  const $  = (id) => document.getElementById(id);
  const LS = window.localStorage;
  const store = {
    get name()  { return LS.getItem("na_name")  || ""; },
    get group() { return LS.getItem("na_group") || ""; },
    get role()  { return LS.getItem("na_role")  || ""; },
    set(name, group, role) {
      LS.setItem("na_name", name); LS.setItem("na_group", group); LS.setItem("na_role", role);
    },
    clear() { ["na_name", "na_group", "na_role"].forEach(k => LS.removeItem(k)); },
  };

  const norm = (g) => g.trim().toUpperCase().replace(/\s+/g, "-");
  function fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    catch { return ""; }
  }
  function showFatal(html) { const f = $("fatal"); f.innerHTML = "<div>" + html + "</div>"; f.hidden = false; }

  function showScreen(which) {
    ["setup", "caregiver", "sleeper"].forEach(s => ($("screen-" + s).hidden = s !== which));
  }

  // ==========================================================================
  //  ALARM SOUND  (Web Audio — loud looping siren, works with app in front)
  // ==========================================================================
  const Alarm = (function () {
    let ctx = null, master = null, timer = null, playing = false;

    function ensureCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 1.0;
        master.connect(ctx.destination);
      }
      return ctx;
    }

    // Call inside a user tap to satisfy iOS autoplay rules.
    async function unlock() {
      ensureCtx();
      if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }
      // Play a tiny silent buffer so iOS marks audio as user-enabled.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    }

    // One rising/falling "wail".
    function wail(startAt) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(660, startAt);
      o.frequency.linearRampToValueAtTime(1180, startAt + 0.35);
      o.frequency.linearRampToValueAtTime(660, startAt + 0.7);
      g.gain.setValueAtTime(0.0001, startAt);
      g.gain.exponentialRampToValueAtTime(0.9, startAt + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.72);
      o.connect(g); g.connect(master);
      o.start(startAt); o.stop(startAt + 0.75);
    }

    function scheduleBatch() {
      if (!playing) return;
      const t0 = ctx.currentTime + 0.02;
      wail(t0);
      wail(t0 + 0.8);
    }

    async function start() {
      ensureCtx();
      if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }
      if (playing) return;
      playing = true;
      scheduleBatch();
      timer = setInterval(scheduleBatch, 1600);
      startVibration();
    }

    function stop() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      stopVibration();
    }

    // Vibration reinforces the alarm (Android carers previewing; iOS ignores).
    let vibTimer = null;
    function startVibration() {
      if (!navigator.vibrate) return;
      const buzz = () => navigator.vibrate([600, 300, 600, 300, 600]);
      buzz(); vibTimer = setInterval(buzz, 2400);
    }
    function stopVibration() {
      if (vibTimer) { clearInterval(vibTimer); vibTimer = null; }
      if (navigator.vibrate) navigator.vibrate(0);
    }

    return { unlock, start, stop, isPlaying: () => playing };
  })();

  // ==========================================================================
  //  SCREEN WAKE LOCK  (keep Mum's screen on so the alarm can always fire)
  // ==========================================================================
  const Wake = (function () {
    let lock = null, want = false;
    async function acquire() {
      want = true;
      if (!("wakeLock" in navigator)) return;
      try { lock = await navigator.wakeLock.request("screen"); }
      catch (e) { /* denied or not visible; will retry on visibility */ }
    }
    function release() { want = false; if (lock) { lock.release().catch(()=>{}); lock = null; } }
    document.addEventListener("visibilitychange", () => {
      if (want && document.visibilityState === "visible") acquire();
    });
    return { acquire, release, wanted: () => want };
  })();

  // ==========================================================================
  //  DATA LAYER
  // ==========================================================================
  const me = { name: "", group: "", role: "" };

  async function getActiveAlert() {
    const { data, error } = await sb
      .from("night_alerts")
      .select("*")
      .eq("group_id", me.group)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) { console.warn(error); return null; }
    return data && data[0] ? data[0] : null;
  }

  async function getRecent() {
    const { data, error } = await sb
      .from("night_alerts")
      .select("*")
      .eq("group_id", me.group)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) { console.warn(error); return []; }
    return data || [];
  }

  // Carer raises an alert. If one is already active, just append our name.
  async function raiseAlert() {
    const active = await getActiveAlert();
    if (active) {
      const names = new Set(active.also_requested_by || []);
      if (active.created_by !== me.name) names.add(me.name);
      const { error } = await sb.from("night_alerts")
        .update({ also_requested_by: Array.from(names) })
        .eq("id", active.id);
      if (error) throw error;
      return active;
    }
    const { data, error } = await sb.from("night_alerts")
      .insert({ group_id: me.group, created_by: me.name, status: "active" })
      .select().single();
    if (error) throw error;
    pushAlarm(me.group);   // fire the instant push (no-op until deployed)
    return data;
  }

  // Ask the server to send the instant wake-up push. Best-effort.
  function pushAlarm(group) {
    try {
      fetch(CFG.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/push-alarm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CFG.SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + CFG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ group_id: group }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  async function cancelAlert(id) {
    await sb.from("night_alerts").update({ status: "cancelled" }).eq("id", id);
  }

  async function confirmAlert(id, note) {
    await sb.from("night_alerts").update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: SLEEPER_NAME,
      confirmed_note: note || null,
    }).eq("id", id);
  }

  // ==========================================================================
  //  REALTIME
  // ==========================================================================
  let channel = null;
  function subscribe(onChange) {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel("alerts-" + me.group)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "night_alerts", filter: "group_id=eq." + me.group },
        (payload) => onChange(payload))
      .subscribe();
  }

  // ==========================================================================
  //  SETUP SCREEN
  // ==========================================================================
  let pendingRole = "";
  function initSetup() {
    $("input-name").value  = store.name;
    $("input-group").value = store.group;

    document.querySelectorAll(".role-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        pendingRole = btn.dataset.role;
        submitSetup();
      });
    });
  }

  function submitSetup() {
    const name  = $("input-name").value.trim();
    const group = norm($("input-group").value);
    const err   = $("setup-error");
    if (!name)  { err.textContent = "Please type your name.";        err.hidden = false; return; }
    if (!group) { err.textContent = "Please type your group code.";  err.hidden = false; return; }
    err.hidden = true;
    store.set(name, group, pendingRole);
    boot();
  }

  // ==========================================================================
  //  CAREGIVER SCREEN
  // ==========================================================================
  function initCaregiver() {
    $("care-who").textContent   = me.name;
    $("care-group").textContent = me.group;

    $("btn-send").addEventListener("click", async () => {
      const b = $("btn-send"); b.disabled = true;
      try { await raiseAlert(); }
      catch (e) { alert("Couldn't send — check your connection.\n\n" + (e.message || e)); }
      finally { b.disabled = false; }
      await refreshCaregiver();
    });

    $("btn-cancel").addEventListener("click", async () => {
      const active = await getActiveAlert();
      if (active) await cancelAlert(active.id);
      await refreshCaregiver();
    });

    subscribe(() => refreshCaregiver());
    refreshCaregiver();
  }

  async function refreshCaregiver() {
    const active = await getActiveAlert();
    const box = $("status-box"), emoji = $("status-emoji"), text = $("status-text"), detail = $("status-detail");
    const send = $("btn-send"), cancel = $("btn-cancel");

    box.classList.remove("idle", "waiting", "done");

    if (active) {
      box.classList.add("waiting");
      emoji.textContent = "🔔";
      text.textContent = SLEEPER_NAME + " is being woken…";
      const who = [active.created_by, ...(active.also_requested_by || [])];
      detail.textContent = "Alarm sent by " + who.join(", ") + " at " + fmtTime(active.created_at) +
                           ". Waiting for " + SLEEPER_NAME + " to check in.";
      send.disabled = true;
      send.querySelector("[data-send-label]").innerHTML = "Alarm is ringing…";
      cancel.hidden = false;
    } else {
      // Was the most recent one just confirmed? Show a friendly "done" state.
      const recent = await getRecent();
      const last = recent[0];
      if (last && last.status === "confirmed") {
        box.classList.add("done");
        emoji.textContent = "✅";
        text.textContent = SLEEPER_NAME + " has checked in";
        detail.textContent = (last.confirmed_note ? "“" + last.confirmed_note + "” — " : "") +
                             "confirmed at " + fmtTime(last.confirmed_at) + ".";
      } else {
        box.classList.add("idle");
        emoji.textContent = "🟢";
        text.textContent = "All quiet";
        detail.textContent = "No active alert right now.";
      }
      send.disabled = false;
      send.querySelector("[data-send-label]").innerHTML =
        "Wake " + SLEEPER_NAME + " up";
      cancel.hidden = true;
    }
    renderLog($("care-log"), await getRecent());
  }

  // ==========================================================================
  //  SLEEPER SCREEN
  // ==========================================================================
  let armed = false;
  let currentAlarmId = null;
  let confirmedId = null;     // alert we just confirmed locally (don't re-ring it)
  let sleeperTimer = null;    // periodic self-heal while armed (auto-repeat)

  function initSleeper() {
    $("sleep-who").textContent   = me.name;
    $("sleep-group").textContent = me.group;

    $("btn-arm").addEventListener("click", async () => {
      await Alarm.unlock();      // must be inside the tap
      await Wake.acquire();
      armed = true;
      $("arm-panel").hidden = true;
      $("armed-panel").hidden = false;
      await refreshSleeper();
      // Auto-repeat: re-check every few seconds so a stopped alarm restarts
      // until she actually confirms.
      if (!sleeperTimer) sleeperTimer = setInterval(refreshSleeper, 3000);
    });

    $("btn-disarm").addEventListener("click", () => {
      armed = false;
      if (sleeperTimer) { clearInterval(sleeperTimer); sleeperTimer = null; }
      Wake.release();
      Alarm.stop();
      $("armed-panel").hidden = true;
      $("arm-panel").hidden = false;
    });

    $("btn-test").addEventListener("click", testAlarm);
    $("btn-test-2").addEventListener("click", testAlarm);

    $("btn-confirm").addEventListener("click", () => doConfirm(null));
    document.querySelectorAll(".note-btn").forEach(b =>
      b.addEventListener("click", () => doConfirm(b.dataset.note)));

    subscribe(handleSleeperEvent);
    refreshSleeper();

    // If the screen wakes from being off, re-check for a missed alert.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && armed) refreshSleeper();
    });
  }

  async function testAlarm() {
    await Alarm.unlock();
    await Alarm.start();
    setTimeout(() => Alarm.stop(), 3000);
  }

  function handleSleeperEvent(payload) {
    const row = payload.new || payload.old;
    if (!row || row.group_id !== me.group) return;
    refreshSleeper();
  }

  async function refreshSleeper() {
    renderLog($("sleep-log"), await getRecent());
    const active = await getActiveAlert();

    if (active && armed && active.id !== confirmedId) {
      if (currentAlarmId !== active.id) {
        // New alert -> ring.
        currentAlarmId = active.id;
        const who = [active.created_by, ...(active.also_requested_by || [])];
        $("alarm-from").textContent = who.join(" & ") + " asked you to check.";
        $("alarm-overlay").hidden = false;
        $("thanks-overlay").hidden = true;
        Alarm.start();
      } else if (!Alarm.isPlaying()) {
        // Auto-repeat: alarm stopped but she hasn't confirmed -> ring again.
        $("alarm-overlay").hidden = false;
        Alarm.start();
      }
    } else {
      // No active alert (or just confirmed) -> make sure we're silent.
      currentAlarmId = null;
      Alarm.stop();
      $("alarm-overlay").hidden = true;
    }
  }

  async function doConfirm(note) {
    Alarm.stop();
    const id = currentAlarmId;
    if (id) confirmedId = id;   // guard: don't let the self-heal re-ring this one
    $("alarm-overlay").hidden = true;
    $("thanks-overlay").hidden = false;
    if (id) { try { await confirmAlert(id, note); } catch (e) { console.warn(e); } }
    currentAlarmId = null;
    setTimeout(() => { $("thanks-overlay").hidden = true; }, 4000);
  }

  // ==========================================================================
  //  LOG rendering (shared)
  // ==========================================================================
  function renderLog(ul, rows) {
    if (!rows || !rows.length) { ul.innerHTML = '<li class="muted">Nothing yet.</li>'; return; }
    ul.innerHTML = rows.map(r => {
      const who = [r.created_by, ...(r.also_requested_by || [])].join(", ");
      if (r.status === "confirmed") {
        return `<li>✅ <b>${esc(SLEEPER_NAME)} checked in</b>` +
               (r.confirmed_note ? " — " + esc(r.confirmed_note) : "") +
               ` <span class="t">${fmtTime(r.confirmed_at)}</span><br>` +
               `<span class="t">Alarm by ${esc(who)} at ${fmtTime(r.created_at)}</span></li>`;
      }
      if (r.status === "cancelled") {
        return `<li>⚪️ Cancelled (false alarm) <span class="t">${fmtTime(r.created_at)}</span></li>`;
      }
      return `<li>🔔 <b>Alarm active</b> — by ${esc(who)} <span class="t">${fmtTime(r.created_at)}</span></li>`;
    }).join("");
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

  // ==========================================================================
  //  BOOT
  // ==========================================================================
  function boot() {
    me.name = store.name; me.group = store.group; me.role = store.role;

    // top-bar "Change" buttons
    document.querySelectorAll('[data-action="switch"]').forEach(b =>
      b.addEventListener("click", () => { if (channel) sb.removeChannel(channel); store.clear(); location.reload(); }, { once: true }));

    if (!me.name || !me.group || !me.role) { showScreen("setup"); return; }
    if (me.role === "caregiver") { showScreen("caregiver"); initCaregiver(); }
    else { showScreen("sleeper"); initSleeper(); }
  }

  // ---- Start ---------------------------------------------------------------
  initSetup();
  boot();

  // Register the service worker (installability + offline shell).
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
})();
