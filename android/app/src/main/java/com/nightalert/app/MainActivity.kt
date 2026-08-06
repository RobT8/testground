package com.nightalert.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.nightalert.app.databinding.ActivityMainBinding
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class MainActivity : AppCompatActivity() {

    private lateinit var b: ActivityMainBinding
    private lateinit var prefs: Prefs
    private val ui = Handler(Looper.getMainLooper())
    private var refreshRunnable: Runnable? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)

        if (!Config.isConfigured()) {
            show(b.configError)
            return
        }
        createConfirmChannel()
        wireSetup()
        route()
    }

    /** Channel for the "she's checked in" ping shown on carers' phones. */
    private fun createConfirmChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val ch = android.app.NotificationChannel(
            "confirm", "Check-in confirmations", android.app.NotificationManager.IMPORTANCE_HIGH
        ).apply { description = "Tells you when ${Config.SLEEPER_NAME} has checked in." }
        nm.createNotificationChannel(ch)
    }

    // -------------------------------------------------------------------------
    //  Routing between the three screens
    // -------------------------------------------------------------------------
    private fun route() {
        when {
            !prefs.isSetUp -> showSetup()
            prefs.role == "carer" -> showCarer()
            prefs.role == "sleeper" -> showSleeper()
            else -> showSetup()
        }
    }

    private fun show(vararg visible: View) {
        for (v in listOf(b.configError, b.setupPanel, b.carerPanel, b.sleeperPanel)) {
            v.visibility = if (visible.contains(v)) View.VISIBLE else View.GONE
        }
    }

    // -------------------------------------------------------------------------
    //  SETUP
    // -------------------------------------------------------------------------
    private fun showSetup() {
        show(b.setupPanel)
        b.inputName.setText(prefs.name)
        b.inputGroup.setText(prefs.group)
    }

    private fun wireSetup() {
        b.roleSleeper.setOnClickListener { saveSetup("sleeper") }
        b.roleCarer.setOnClickListener { saveSetup("carer") }
        b.carerChange.setOnClickListener { resetIdentity() }
        b.sleeperChange.setOnClickListener { resetIdentity() }
    }

    private fun saveSetup(role: String) {
        val name = b.inputName.text.toString().trim()
        val group = Prefs.normalizeGroup(b.inputGroup.text.toString())
        if (name.isEmpty()) { setupErr("Please type your name."); return }
        if (group.isEmpty()) { setupErr("Please type your group code."); return }
        b.setupError.visibility = View.GONE
        prefs.name = name; prefs.group = group; prefs.role = role
        route()
    }

    private fun setupErr(msg: String) {
        b.setupError.text = msg
        b.setupError.visibility = View.VISIBLE
    }

    private fun resetIdentity() {
        stopRefresh()
        AlarmService.stop(this)
        Heartbeat.cancel(this)
        val n = prefs.name; val g = prefs.group
        prefs.clear()
        prefs.name = n; prefs.group = g   // keep name/group, drop role + armed
        showSetup()
    }

    // -------------------------------------------------------------------------
    //  CARER
    // -------------------------------------------------------------------------
    private fun showCarer() {
        show(b.carerPanel)
        b.carerWho.text = "${prefs.name} · ${prefs.group}"
        b.btnWake.text = "🔔  Wake ${Config.SLEEPER_NAME} up"

        // Enrol this carer phone for the check-in ping (needs notifications).
        requestNotificationPermissionIfNeeded()
        Fcm.registerToken(this)

        b.btnWake.setOnClickListener {
            b.btnWake.isEnabled = false
            bg({ Supa.raiseAlert(prefs.group, prefs.name) }) {
                b.btnWake.isEnabled = true
                refreshCarer()
            }
        }
        b.btnCancel.setOnClickListener {
            bg({ Supa.getActiveAlert(prefs.group)?.let { Supa.cancelAlert(it.id) } }) { refreshCarer() }
        }
        startRefresh { refreshCarer() }
    }

    private fun refreshCarer() {
        bg({ Pair(Supa.getActiveAlert(prefs.group), Supa.getRecent(prefs.group)) }) { (active, recent) ->
            if (active != null) {
                val checking = isFuture(active.snoozedUntil)
                if (checking) {
                    b.carerStatusEmoji.text = "🔎"
                    b.carerStatusTitle.text = "${Config.SLEEPER_NAME} is awake, checking…"
                    b.carerStatusDetail.text =
                        "She's checking her levels now — you'll see ✅ when she confirms."
                } else {
                    b.carerStatusEmoji.text = "🔔"
                    b.carerStatusTitle.text = "${Config.SLEEPER_NAME} is being woken…"
                    val who = active.requesters().joinToString(", ")
                    b.carerStatusDetail.text =
                        "Alarm sent by $who at ${fmt(active.createdAt)}. Waiting for ${Config.SLEEPER_NAME} to check in."
                }
                b.btnWake.isEnabled = false
                b.btnWake.text = if (checking) "She's checking…" else "Alarm is ringing…"
                b.btnCancel.visibility = View.VISIBLE
            } else {
                val last = recent.firstOrNull()
                if (last != null && last.status == "confirmed") {
                    b.carerStatusEmoji.text = "✅"
                    b.carerStatusTitle.text = "${Config.SLEEPER_NAME} has checked in"
                    val note = if (last.confirmedNote != null) "“${last.confirmedNote}” — " else ""
                    b.carerStatusDetail.text = "${note}confirmed at ${fmt(last.confirmedAt)}."
                } else {
                    b.carerStatusEmoji.text = "🟢"
                    b.carerStatusTitle.text = "All quiet"
                    b.carerStatusDetail.text = "No active alert right now."
                }
                b.btnWake.isEnabled = true
                b.btnWake.text = "🔔  Wake ${Config.SLEEPER_NAME} up"
                b.btnCancel.visibility = View.GONE
            }
            b.carerLog.text = renderLog(recent)
        }
    }

    // -------------------------------------------------------------------------
    //  SLEEPER
    // -------------------------------------------------------------------------
    private fun showSleeper() {
        show(b.sleeperPanel)
        b.sleeperWho.text = "${prefs.name} · ${prefs.group}"
        updateArmedUi()

        b.btnArm.setOnClickListener { arm() }
        b.btnDisarm.setOnClickListener { disarm() }
        b.btnTest.setOnClickListener { testAlarm() }
        b.btnTest2.setOnClickListener { testAlarm() }

        startRefresh { bg({ Supa.getRecent(prefs.group) }) { b.sleeperLog.text = renderLog(it) } }
    }

    private fun updateArmedUi() {
        b.armPanel.visibility = if (prefs.armed) View.GONE else View.VISIBLE
        b.armedPanel.visibility = if (prefs.armed) View.VISIBLE else View.GONE
    }

    private fun arm() {
        requestNotificationPermissionIfNeeded()
        askIgnoreBatteryOptimizations()
        prefs.armed = true
        AlarmService.start(this)
        Heartbeat.schedule(this)
        Fcm.registerToken(this)   // enrol for instant push (no-op until Firebase is set up)
        updateArmedUi()
        Toast.makeText(this, "Armed — you'll be woken if you're needed.", Toast.LENGTH_LONG).show()
    }

    private fun disarm() {
        prefs.armed = false
        AlarmService.stop(this)
        Heartbeat.cancel(this)
        updateArmedUi()
    }

    private fun testAlarm() {
        AlarmPlayer.start(this)
        ui.postDelayed({ AlarmPlayer.stop(this) }, 3000)
    }

    // -------------------------------------------------------------------------
    //  Permissions
    // -------------------------------------------------------------------------
    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7)
            }
        }
    }

    private fun askIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) return
        try {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName"))
            )
        } catch (_: Exception) { /* some devices hide this — that's fine */ }
    }

    // -------------------------------------------------------------------------
    //  Periodic refresh
    // -------------------------------------------------------------------------
    private fun startRefresh(tick: () -> Unit) {
        stopRefresh()
        refreshRunnable = object : Runnable {
            override fun run() {
                tick()
                ui.postDelayed(this, 4000)
            }
        }
        ui.post(refreshRunnable!!)
    }

    private fun stopRefresh() {
        refreshRunnable?.let { ui.removeCallbacks(it) }
        refreshRunnable = null
    }

    override fun onResume() {
        super.onResume()
        if (Config.isConfigured() && prefs.isSetUp) route()
    }

    override fun onPause() {
        super.onPause()
        stopRefresh()
    }

    // -------------------------------------------------------------------------
    //  Helpers
    // -------------------------------------------------------------------------
    /** Run [work] on a background thread, deliver the result to [done] on the UI thread. */
    private fun <T> bg(work: () -> T, done: (T) -> Unit) {
        Thread {
            try {
                val r = work()
                ui.post { done(r) }
            } catch (e: Exception) {
                ui.post { /* keep quiet; next tick retries */ }
            }
        }.start()
    }

    private fun renderLog(rows: List<Alert>): String {
        if (rows.isEmpty()) return "Nothing yet."
        return rows.joinToString("\n") { r ->
            val who = r.requesters().joinToString(", ")
            when (r.status) {
                "confirmed" -> "✅  ${Config.SLEEPER_NAME} checked in" +
                        (if (r.confirmedNote != null) " — ${r.confirmedNote}" else "") +
                        "  (${fmt(r.confirmedAt)})"
                "cancelled" -> "⚪  Cancelled — false alarm  (${fmt(r.createdAt)})"
                else -> "🔔  Alarm by $who  (${fmt(r.createdAt)})"
            }
        }
    }

    private val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
    private val outFmt = SimpleDateFormat("h:mm a", Locale.getDefault())

    private fun fmt(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return try {
            val clean = iso.substringBefore('.').substringBefore('+').removeSuffix("Z")
            outFmt.format(parser.parse(clean)!!)
        } catch (_: Exception) { "" }
    }

    /** True if the given UTC timestamp is still in the future (used for "checking"). */
    private fun isFuture(iso: String?): Boolean {
        if (iso.isNullOrBlank()) return false
        return try {
            val clean = iso.substringBefore('.').substringBefore('+').removeSuffix("Z")
            (parser.parse(clean)?.time ?: 0L) > System.currentTimeMillis()
        } catch (_: Exception) { false }
    }
}
