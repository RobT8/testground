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
 * The full-screen, impossible-to-miss wake-up screen shown on the sleeper's
 * phone. Appears over the lock screen, turns the screen on, and stays until she
 * taps a confirm button.
 *
 * "I'm awake — checking now" quiets the siren for a couple of minutes (so she can
 * read her levels / another app in peace) without confirming; if she hasn't
 * tapped a confirm button by the time it elapses, the alarm returns.
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

        // Make sure the noise is going even if we opened directly.
        if (!AlarmPlayer.isPlaying) AlarmPlayer.start(this)

        b.confirm.setOnClickListener { confirm(null) }
        b.noteLevels.setOnClickListener { confirm("Checked my levels") }
        b.noteMeds.setOnClickListener { confirm("Took my medication") }
        b.noteFood.setOnClickListener { confirm("Had food / juice") }
        b.checking.setOnClickListener { enterCheckingMode() }

        LocalBroadcastManager.getInstance(this)
            .registerReceiver(stopReceiver, IntentFilter(AlarmService.ACTION_ALARM_STOPPED))
    }

    /** The alarm resumed (snooze expired) and re-launched us — restore alarm mode. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        resetToAlarmMode()
    }

    // ---- "I'm awake — checking now" -----------------------------------------
    private fun enterCheckingMode() {
        val id = alertId ?: return

        // Locally + on the server, drop to the gentle reminder for a couple of minutes.
        prefs.localSnoozeUntil = System.currentTimeMillis() + SNOOZE_MS
        AlarmPlayer.ensureReminding(this)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(AlarmService.ALARM_NOTIF_ID)
        Thread { try { Supa.snoozeAlert(id, isoInMillis(SNOOZE_MS)) } catch (_: Exception) {} }.start()

        // Calm the screen down.
        b.root.setBackgroundColor(ContextCompat.getColor(this, R.color.bg))
        b.alarmTitle.text = "Take your time 👍"
        b.checking.visibility = View.GONE
        b.checkingBanner.visibility = View.VISIBLE

        // Bring the loud alarm back if she hasn't confirmed in time.
        ui.removeCallbacks(backToAlarm)
        ui.postDelayed(backToAlarm, SNOOZE_MS)
    }

    private fun resetToAlarmMode() {
        prefs.localSnoozeUntil = 0L
        b.root.setBackgroundColor(ContextCompat.getColor(this, R.color.alarm_bg))
        b.alarmTitle.text = "Time to check your\nblood sugar"
        b.checkingBanner.visibility = View.GONE
        b.checking.visibility = View.VISIBLE
        AlarmPlayer.ensureAlarming(this)   // switch from reminder back to the loud alarm
    }

    private fun confirm(note: String?) {
        // Guard first: tell the watcher this alert is done, so it won't re-ring
        // in the moment before the confirmation reaches the server.
        alertId?.let { prefs.confirmedAlertId = it }
        prefs.localSnoozeUntil = 0L
        ui.removeCallbacks(backToAlarm)

        // Stop the noise immediately for a good experience.
        AlarmPlayer.stop(this)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(AlarmService.ALARM_NOTIF_ID)

        // Show the thank-you state right away.
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

    @Deprecated("Blocked on purpose — she must confirm.")
    override fun onBackPressed() {
        // Ignore the back button so the alarm can't be swiped away by accident.
    }

    companion object {
        const val SNOOZE_MS = 2 * 60 * 1000L
    }
}
