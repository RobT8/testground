package com.nightalert.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.nightalert.app.databinding.ActivityAlarmBinding

/**
 * The full-screen, impossible-to-miss wake-up screen shown on the sleeper's
 * phone. Appears over the lock screen, turns the screen on, and stays until she
 * taps a confirm button.
 */
class AlarmActivity : AppCompatActivity() {

    private lateinit var b: ActivityAlarmBinding
    private lateinit var prefs: Prefs
    private var alertId: String? = null

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

        LocalBroadcastManager.getInstance(this)
            .registerReceiver(stopReceiver, IntentFilter(AlarmService.ACTION_ALARM_STOPPED))
    }

    private fun confirm(note: String?) {
        // Guard first: tell the watcher this alert is done, so it won't re-ring
        // in the moment before the confirmation reaches the server.
        alertId?.let { prefs.confirmedAlertId = it }

        // Stop the noise immediately for a good experience.
        AlarmPlayer.stop(this)
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(AlarmService.ALARM_NOTIF_ID)

        // Show the thank-you state right away.
        b.mainPanel.visibility = android.view.View.GONE
        b.thanksPanel.visibility = android.view.View.VISIBLE

        val id = alertId
        if (id != null) {
            Thread {
                try { Supa.confirmAlert(id, note, Config.SLEEPER_NAME) } catch (_: Exception) {}
            }.start()
        }

        b.root.postDelayed({ finish() }, 3500)
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
        LocalBroadcastManager.getInstance(this).unregisterReceiver(stopReceiver)
        super.onDestroy()
    }

    @Deprecated("Blocked on purpose — she must confirm.")
    override fun onBackPressed() {
        // Ignore the back button so the alarm can't be swiped away by accident.
    }
}
