package com.nightalert.app

import android.content.Intent
import android.os.Build
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
            try { Supa.upsertDevice(prefs.group, token, prefs.role.ifBlank { "sleeper" }) }
            catch (_: Exception) {}
        }.start()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val prefs = Prefs(this)
        if (prefs.role != "sleeper" || !prefs.isSetUp) return
        val i = Intent(this, AlarmService::class.java).setAction(AlarmService.ACTION_POLL)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i)
            else startService(i)
        } catch (_: Exception) {
            // If we can't start the service (rare background limit), fall back to
            // ringing directly.
            AlarmPlayer.ensureAlarming(this)
        }
    }
}
