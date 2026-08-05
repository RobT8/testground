package com.nightalert.app

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** One alert row from the `alerts` table. */
data class Alert(
    val id: String,
    val groupId: String,
    val status: String,
    val createdAt: String,
    val createdBy: String,
    val alsoRequestedBy: List<String>,
    val confirmedAt: String?,
    val confirmedBy: String?,
    val confirmedNote: String?
) {
    /** All carers who asked for this alert. */
    fun requesters(): List<String> = (listOf(createdBy) + alsoRequestedBy).distinct()
}

/**
 * Minimal synchronous Supabase REST client (PostgREST).
 * All calls are blocking — always call from a background thread.
 */
object Supa {
    private val JSON = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(20, TimeUnit.SECONDS)
        .build()

    private fun base() = Config.SUPABASE_URL.trimEnd('/') + "/rest/v1/night_alerts"

    private fun Request.Builder.auth(): Request.Builder = this
        .header("apikey", Config.SUPABASE_ANON_KEY)
        .header("Authorization", "Bearer " + Config.SUPABASE_ANON_KEY)

    private fun parse(json: String): List<Alert> {
        val arr = JSONArray(json)
        val out = ArrayList<Alert>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            val also = ArrayList<String>()
            o.optJSONArray("also_requested_by")?.let { a ->
                for (j in 0 until a.length()) also.add(a.getString(j))
            }
            out.add(
                Alert(
                    id = o.getString("id"),
                    groupId = o.optString("group_id"),
                    status = o.optString("status"),
                    createdAt = o.optString("created_at"),
                    createdBy = o.optString("created_by"),
                    alsoRequestedBy = also,
                    confirmedAt = o.optStringOrNull("confirmed_at"),
                    confirmedBy = o.optStringOrNull("confirmed_by"),
                    confirmedNote = o.optStringOrNull("confirmed_note")
                )
            )
        }
        return out
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (isNull(key) || !has(key)) null else optString(key)

    private fun get(query: String): List<Alert> {
        val req = Request.Builder().url(base() + query).auth().get().build()
        client.newCall(req).execute().use { resp ->
            val body = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) throw RuntimeException("GET ${resp.code}: $body")
            return if (body.isBlank()) emptyList() else parse(body)
        }
    }

    fun getActiveAlert(group: String): Alert? =
        get("?group_id=eq.$group&status=eq.active&order=created_at.desc&limit=1").firstOrNull()

    fun getRecent(group: String, limit: Int = 8): List<Alert> =
        get("?group_id=eq.$group&order=created_at.desc&limit=$limit")

    /** Carer raises an alert. If one is already active, just add our name (no 2nd alarm). */
    fun raiseAlert(group: String, name: String): Alert {
        val active = getActiveAlert(group)
        if (active != null) {
            if (active.createdBy != name && !active.alsoRequestedBy.contains(name)) {
                val names = (active.alsoRequestedBy + name).distinct()
                val body = JSONObject().put("also_requested_by", JSONArray(names)).toString()
                val req = Request.Builder()
                    .url(base() + "?id=eq.${active.id}")
                    .auth().header("Content-Type", "application/json")
                    .header("Prefer", "return=minimal")
                    .patch(body.toRequestBody(JSON)).build()
                client.newCall(req).execute().use { r ->
                    if (!r.isSuccessful) throw RuntimeException("PATCH ${r.code}: ${r.body?.string()}")
                }
            }
            return active
        }
        val body = JSONObject()
            .put("group_id", group)
            .put("created_by", name)
            .put("status", "active")
            .toString()
        val req = Request.Builder()
            .url(base())
            .auth().header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .post(body.toRequestBody(JSON)).build()
        client.newCall(req).execute().use { r ->
            val b = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw RuntimeException("POST ${r.code}: $b")
            return parse(b).first()
        }
    }

    fun cancelAlert(id: String) = patch(id, JSONObject().put("status", "cancelled"))

    fun confirmAlert(id: String, note: String?, by: String) = patch(
        id,
        JSONObject()
            .put("status", "confirmed")
            .put("confirmed_at", isoNow())
            .put("confirmed_by", by)
            .put("confirmed_note", note ?: JSONObject.NULL)
    )

    private fun patch(id: String, body: JSONObject) {
        val req = Request.Builder()
            .url(base() + "?id=eq.$id")
            .auth().header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .patch(body.toString().toRequestBody(JSON)).build()
        client.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw RuntimeException("PATCH ${r.code}: ${r.body?.string()}")
        }
    }

    private fun isoNow(): String {
        val f = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        f.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return f.format(java.util.Date())
    }
}
