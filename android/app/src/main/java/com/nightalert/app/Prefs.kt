package com.nightalert.app

import android.content.Context

/** Tiny wrapper around SharedPreferences for the user's identity + role. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("night_alert", Context.MODE_PRIVATE)

    var name: String
        get() = sp.getString("name", "") ?: ""
        set(v) = sp.edit().putString("name", v).apply()

    var group: String
        get() = sp.getString("group", "") ?: ""
        set(v) = sp.edit().putString("group", v).apply()

    /** "carer" or "sleeper" */
    var role: String
        get() = sp.getString("role", "") ?: ""
        set(v) = sp.edit().putString("role", v).apply()

    /** The last alert id we already rang for, so we don't ring twice. */
    var lastRungAlertId: String
        get() = sp.getString("last_rung", "") ?: ""
        set(v) = sp.edit().putString("last_rung", v).apply()

    /** The alert id the sleeper just confirmed locally. Prevents the watcher
     *  from re-ringing in the split second before the confirm reaches the server. */
    var confirmedAlertId: String
        get() = sp.getString("confirmed_id", "") ?: ""
        set(v) = sp.edit().putString("confirmed_id", v).apply()

    /** Epoch millis until which the siren is locally snoozed ("checking now"),
     *  so the watcher stays quiet even before the server update propagates. */
    var localSnoozeUntil: Long
        get() = sp.getLong("local_snooze_until", 0L)
        set(v) = sp.edit().putLong("local_snooze_until", v).apply()

    /** Whether the sleeper has armed the watcher for the night. */
    var armed: Boolean
        get() = sp.getBoolean("armed", false)
        set(v) = sp.edit().putBoolean("armed", v).apply()

    /** Whether we've already shown the one-time battery-exemption prompt. */
    var batteryAsked: Boolean
        get() = sp.getBoolean("battery_asked", false)
        set(v) = sp.edit().putBoolean("battery_asked", v).apply()

    val isSetUp: Boolean get() = name.isNotBlank() && group.isNotBlank() && role.isNotBlank()

    fun clear() = sp.edit().clear().apply()

    companion object {
        fun normalizeGroup(raw: String): String =
            raw.trim().uppercase().replace(Regex("\\s+"), "-")
    }
}
