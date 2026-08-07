package com.nightalert.app

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives the high-priority push a carer's alert triggers. Because FCM
 * high-priority messages punch through Doze, this fires within a second or two
 * even when the phone is unplugged, locked, and in deep sleep — then it kicks
 * the watcher to poll and ring immediately (reusing all the alarm / auto-repeat
 * logic in AlarmService).
 *
 * Only active when a real google-services.json has been added; otherwise the
 * Firebase SDK never initialises and this service is never called.
 */
class FcmService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        val prefs = Prefs(this)
        if (prefs.group.isBlank()) return
        Thread {
            try { Supa.upsertDevice(prefs.group, token, prefs.role.ifBlank { "sleeper" }, prefs.pingMuted) }
            catch (_: Exception) {}
        }.start()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Carer ping: "she's checked in". (Background delivery is handled by the
        // system tray; this covers the app-in-foreground case.)
        if (message.data["type"] == "confirmed") {
            if (Prefs(this).pingMuted) return   // this carer is off duty
            val title = message.notification?.title ?: "Checked in ✅"
            val body = message.notification?.body ?: "They've checked in."
            val notif = NotificationCompat.Builder(this, "confirm")
                .setSmallIcon(R.drawable.ic_alarm_stat)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .build()
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .notify(2001, notif)
            return
        }

        // Otherwise it's a wake-up alarm for the sleeper.
        val prefs = Prefs(this)
        if (prefs.role != "sleeper" || !prefs.isSetUp) return
        val i = Intent(this, AlarmService::class.java).setAction(AlarmService.ACTION_POLL)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i)
            else startService(i)
        } catch (_: Exception) {
            AlarmPlayer.ensureAlarming(this)
        }
    }
}
