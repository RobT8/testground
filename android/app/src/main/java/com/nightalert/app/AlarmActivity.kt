package com.nightalert.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.nightalert.app.databinding.ActivityAlarmBinding
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The full-screen wake-up screen. Two stages:
 *   1. The loud alarm shows ONE big button: "I'm awake, just checking".
 *   2. Tapping it softens the alarm to a gentle reminder and shows three
 *      outcome buttons — Had food/juice, Took medication, No action taken —
 *      each of which confirms (ends the alarm, pings the carers).
 * If she doesn't pick an outcome within 2 minutes, the loud alarm returns.
 */
class AlarmActivity : AppCompatActivity() {

    private lateinit var b: ActivityAlarmBinding
    private lateinit var prefs: Prefs
    private var alertId: String? = null

    private val ui = Handler(Looper.getMainLooper())
    private val backToAlarm = Runnable { resetToAlarmMode() }

    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { finish() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()

        prefs = Prefs(this)
        b = ActivityAlarmBinding.inflate(layoutInflater)
        setContentView(b.root)

        alertId = intent.getStringExtra(AlarmService.EXTRA_ALERT_ID)
        val from = intent.getStringExtra(AlarmService.EXTRA_FROM).orEmpty()
        b.from.text = if (from.isBlank()) "" else "$from asked you to check."

        if (!AlarmPlayer.isPlaying) AlarmPlayer.start(this)

        b.btnJustChecking.setOnClickListener { enterCheckingMode() }
        b.btnFood.setOnClickListener { confirm("Had food / juice") }
        b.btnMeds.setOnClickListener { confirm("Took medication") }
        b.btnNoAction.setOnClickListener { confirm("No action taken") }

        LocalBroadcastManager.getInstance(this)
            .registerReceiver(stopReceiver, IntentFilter(AlarmService.ACTION_ALARM_STOPPED))
    }

    /** The alarm resumed (snooze expired) and re-launched us — restore stage 1. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        resetToAlarmMode()
    }

    // ---- Stage 1 -> Stage 2 --------------------------------------------------
    private fun enterCheckingMode() {
        val id = alertId ?: return

        prefs.localSnoozeUntil = System.currentTimeMillis() + SNOOZE_MS
        AlarmPlayer.ensureReminding(this)   // soften to the reminder beep
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(AlarmService.ALARM_NOTIF_ID)
        Thread { try { Supa.snoozeAlert(id, isoInMillis(SNOOZE_MS)) } catch (_: Exception) {} }.start()

        b.root.setBackgroundColor(ContextCompat.getColor(this, R.color.bg))
        b.alarmStage.visibility = View.GONE
        b.checkingStage.visibility = View.VISIBLE

        // If she doesn't pick an outcome in time, bring the loud alarm back.
        ui.removeCallbacks(backToAlarm)
        ui.postDelayed(backToAlarm, SNOOZE_MS)
    }

    private fun resetToAlarmMode() {
        prefs.localSnoozeUntil = 0L
        ui.removeCallbacks(backToAlarm)
        b.root.setBackgroundColor(ContextCompat.getColor(this, R.color.alarm_bg))
        b.checkingStage.visibility = View.GONE
        b.alarmStage.visibility = View.VISIBLE
        AlarmPlayer.ensureAlarming(this)    // back to the loud alarm
    }

    private fun confirm(note: String?) {
        // Guard so the watcher won't re-ring before the server hears the confirm.
        alertId?.let { prefs.confirmedAlertId = it }
        prefs.localSnoozeUntil = 0L
        ui.removeCallbacks(backToAlarm)

        AlarmPlayer.stop(this)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(AlarmService.ALARM_NOTIF_ID)

        b.mainPanel.visibility = View.GONE
        b.thanksPanel.visibility = View.VISIBLE

        val id = alertId
        if (id != null) {
            Thread {
                try { Supa.confirmAlert(id, note, Config.SLEEPER_NAME) } catch (_: Exception) {}
                try { Supa.pushConfirmed(prefs.group, note, Config.SLEEPER_NAME) } catch (_: Exception) {}
            }.start()
        }

        b.root.postDelayed({ finish() }, 3500)
    }

    private fun isoInMillis(ms: Long): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date(System.currentTimeMillis() + ms))
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onDestroy() {
        ui.removeCallbacks(backToAlarm)
        LocalBroadcastManager.getInstance(this).unregisterReceiver(stopReceiver)
        super.onDestroy()
    }

    @Deprecated("Blocked on purpose — she must pick an outcome.")
    override fun onBackPressed() {
        // Ignore the back button so the alarm can't be swiped away by accident.
    }

    companion object {
        const val SNOOZE_MS = 2 * 60 * 1000L
    }
}
