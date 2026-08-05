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

    /** Whether the sleeper has armed the watcher for the night. */
    var armed: Boolean
        get() = sp.getBoolean("armed", false)
        set(v) = sp.edit().putBoolean("armed", v).apply()

    val isSetUp: Boolean get() = name.isNotBlank() && group.isNotBlank() && role.isNotBlank()

    fun clear() = sp.edit().clear().apply()

    companion object {
        fun normalizeGroup(raw: String): String =
            raw.trim().uppercase().replace(Regex("\\s+"), "-")
    }
}
