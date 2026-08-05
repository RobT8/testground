package com.nightalert.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restarts the watcher after the phone reboots — so the sleeper doesn't have to
 * remember to re-open the app if her phone restarts overnight.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            val prefs = Prefs(context)
            if (prefs.role == "sleeper" && prefs.isSetUp) {
                AlarmService.start(context)
                Heartbeat.schedule(context)
            }
        }
    }
}
