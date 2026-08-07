package com.nightalert.app

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Firebase Cloud Messaging helper. Everything here is a safe no-op until a real
 * google-services.json is added to the app and Firebase initialises — so the app
 * works fine (via polling) with or without push configured.
 */
object Fcm {

    fun isAvailable(context: Context): Boolean =
        try { FirebaseApp.getApps(context).isNotEmpty() } catch (_: Exception) { false }

    /** Fetch this phone's push token and store it so the server can wake it. */
    fun registerToken(context: Context) {
        if (!isAvailable(context)) return
        val prefs = Prefs(context)
        if (prefs.group.isBlank()) return
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) return@addOnCompleteListener
                val token = task.result ?: return@addOnCompleteListener
                Thread {
                    try {
                        Supa.upsertDevice(prefs.group, token, prefs.role.ifBlank { "sleeper" }, prefs.pingMuted)
                    } catch (_: Exception) {}
                }.start()
            }
        } catch (_: Exception) {}
    }
}
