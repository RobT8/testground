package com.nightalert.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager

/**
 * The always-on watcher that runs on the SLEEPER's phone.
 *
 * It runs as a foreground service (so Android keeps it alive even when the app
 * is closed / the phone is locked), polls Supabase for a new active alert, and
 * when one appears it starts the loud alarm and shows the full-screen check-in
 * screen — over the lock screen, screen off, on silent, whatever.
 */
class AlarmService : Service() {

    @Volatile private var running = false
    @Volatile private var ringingForAlert = false
    private var worker: Thread? = null
    private lateinit var prefs: Prefs

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        createChannels()
        startForeground(WATCH_NOTIF_ID, buildWatchNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_POLL) {
            // Heartbeat woke us up (Doze). Do one immediate poll, then reschedule.
            Thread { pollOnce() }.start()
            Heartbeat.schedule(this)
        }
        if (!running) startLoop()
        Heartbeat.schedule(this)
        return START_STICKY
    }

    private fun startLoop() {
        running = true
        worker = Thread {
            while (running) {
                pollOnce()
                try { Thread.sleep(POLL_INTERVAL_MS) } catch (_: InterruptedException) { break }
            }
        }.also { it.isDaemon = true; it.start() }
    }

    private fun pollOnce() {
        if (!Config.isConfigured()) return
        val group = prefs.group
        if (group.isBlank()) return
        try {
            val active = Supa.getActiveAlert(group)
            val isOpen = active != null && active.status == "active" &&
                active.id != prefs.confirmedAlertId
            val snoozed = isOpen && isSnoozed(active!!)

            if (isOpen && !snoozed) {
                // An unconfirmed, un-snoozed alert -> keep the alarm going,
                // relentlessly. ensureAlarming restarts the sound if it stopped and
                // re-maxes the volume, so it auto-repeats until she confirms.
                val isNew = prefs.lastRungAlertId != active!!.id
                if (isNew) prefs.lastRungAlertId = active.id
                ringingForAlert = true
                val restarted = AlarmPlayer.ensureAlarming(this)
                // Re-surface the full-screen screen on the first ring and any time
                // the sound had to be restarted (dismissed, or a snooze expired).
                if (isNew || restarted) {
                    showAlarmNotification(active)   // covers locked / background (full-screen intent)
                    launchAlarmActivity(active)     // covers app-in-foreground (FSI won't auto-launch then)
                }
                cancelNotif(CHECKING_NOTIF_ID)
            } else if (snoozed) {
                // "I'm awake — checking now": drop to the gentle reminder beep
                // (not silence) and keep a tap-to-return notification.
                AlarmPlayer.ensureReminding(this)
                ringingForAlert = true
                cancelNotif(ALARM_NOTIF_ID)
                showCheckingNotification(active!!)
            } else {
                // Confirmed / cancelled / no alert -> fully quiet.
                if (ringingForAlert && AlarmPlayer.isPlaying) {
                    AlarmPlayer.stop(this)
                    LocalBroadcastManager.getInstance(this)
                        .sendBroadcast(Intent(ACTION_ALARM_STOPPED))
                }
                ringingForAlert = false
                cancelNotif(ALARM_NOTIF_ID)
                cancelNotif(CHECKING_NOTIF_ID)
            }
        } catch (_: Exception) {
            // Network hiccup — ignore and try again next tick.
        }
    }

    private fun isSnoozed(alert: Alert): Boolean {
        val now = System.currentTimeMillis()
        if (now < prefs.localSnoozeUntil) return true
        val until = parseIsoMillis(alert.snoozedUntil) ?: return false
        return now < until
    }

    private fun parseIsoMillis(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        return try {
            val clean = iso.substringBefore('.').substringBefore('+').removeSuffix("Z")
            val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
            f.timeZone = java.util.TimeZone.getTimeZone("UTC")
            f.parse(clean)?.time
        } catch (_: Exception) { null }
    }

    private fun cancelNotif(id: Int) =
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(id)

    private fun showCheckingNotification(alert: Alert) {
        val pi = PendingIntent.getActivity(
            this, 2,
            Intent(this, AlarmActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra(EXTRA_ALERT_ID, alert.id)
                putExtra(EXTRA_FROM, alert.requesters().joinToString(" & "))
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(this, WATCH_CHANNEL)
            .setSmallIcon(R.drawable.ic_alarm_stat)
            .setContentTitle("Checking your levels…")
            .setContentText("Tap here when you're done, to let them know.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(CHECKING_NOTIF_ID, notif)
    }

    /** Directly open the full-screen alarm. Works when the app is in the
     *  foreground (where a full-screen-intent notification only shows a heads-up
     *  banner); harmlessly blocked in the background, where the FSI covers us. */
    private fun launchAlarmActivity(alert: Alert) {
        val i = Intent(this, AlarmActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(EXTRA_ALERT_ID, alert.id)
            putExtra(EXTRA_FROM, alert.requesters().joinToString(" & "))
        }
        try { startActivity(i) } catch (_: Exception) {}
    }

    private fun showAlarmNotification(alert: Alert) {
        val full = Intent(this, AlarmActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(EXTRA_ALERT_ID, alert.id)
            putExtra(EXTRA_FROM, alert.requesters().joinToString(" & "))
        }
        val pi = PendingIntent.getActivity(
            this, 1, full,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(this, ALARM_CHANNEL)
            .setSmallIcon(R.drawable.ic_alarm_stat)
            .setContentTitle("Time to check your blood sugar")
            .setContentText("Tap to open and confirm")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(pi, true)
            .setContentIntent(pi)
            .build()

        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(ALARM_NOTIF_ID, notif)
    }

    override fun onDestroy() {
        running = false
        worker?.interrupt()
        super.onDestroy()
    }

    // ---- Notifications -------------------------------------------------------
    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val watch = NotificationChannel(
            WATCH_CHANNEL, "Watching for alerts", NotificationManager.IMPORTANCE_LOW
        ).apply { description = "Keeps the app ready to ring you at night."; setShowBadge(false) }
        nm.createNotificationChannel(watch)

        val alarm = NotificationChannel(
            ALARM_CHANNEL, "Wake-up alarm", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "The loud alarm that wakes you to check your levels."
            setBypassDnd(true)
            enableVibration(true)
            enableLights(true)
        }
        nm.createNotificationChannel(alarm)
    }

    private fun buildWatchNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, WATCH_CHANNEL)
            .setSmallIcon(R.drawable.ic_alarm_stat)
            .setContentTitle("Night Alert is ready")
            .setContentText("Listening — you'll be woken if you're needed.")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    companion object {
        const val WATCH_CHANNEL = "watch"
        const val ALARM_CHANNEL = "alarm"
        const val WATCH_NOTIF_ID = 1001
        const val ALARM_NOTIF_ID = 1002
        const val CHECKING_NOTIF_ID = 1003
        const val POLL_INTERVAL_MS = 4000L

        const val ACTION_POLL = "com.nightalert.app.POLL"
        const val ACTION_ALARM_STOPPED = "com.nightalert.app.ALARM_STOPPED"
        const val EXTRA_ALERT_ID = "alert_id"
        const val EXTRA_FROM = "from"

        fun start(context: Context) {
            val i = Intent(context, AlarmService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(i)
            } else {
                context.startService(i)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, AlarmService::class.java))
        }
    }
}
