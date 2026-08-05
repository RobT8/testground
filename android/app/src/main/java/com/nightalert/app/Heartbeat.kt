package com.nightalert.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * A backstop for deep "Doze" power-saving when the phone is unplugged and still.
 * We schedule an exact alarm every few minutes that fires even in Doze, which
 * wakes the service to poll once. On the charger this rarely matters (Doze is
 * disabled while charging), but it keeps things prompt off-charger too.
 */
object Heartbeat {
    private const val INTERVAL_MS = 9 * 60 * 1000L // ~9 min (min allowed in deep Doze)

    fun schedule(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pendingIntent(context)
        val triggerAt = System.currentTimeMillis() + INTERVAL_MS
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
        } catch (_: SecurityException) {
            // Exact alarms not permitted — fall back to inexact.
            am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        }
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pendingIntent(context))
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val i = Intent(context, HeartbeatReceiver::class.java).setAction(HeartbeatReceiver.ACTION)
        return PendingIntent.getBroadcast(
            context, 42, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}

/** Receives the heartbeat and nudges the service to poll. */
class HeartbeatReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val svc = Intent(context, AlarmService::class.java).setAction(AlarmService.ACTION_POLL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svc)
        } else {
            context.startService(svc)
        }
    }

    companion object {
        const val ACTION = "com.nightalert.app.HEARTBEAT"
    }
}
