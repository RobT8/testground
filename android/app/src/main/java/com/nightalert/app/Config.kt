package com.nightalert.app

/**
 * ============================================================================
 *  CONFIG — fill in these two values, then the app is ready to build.
 * ============================================================================
 *
 *  These are the SAME two values used by the web app (see the web README).
 *  If you already created a Supabase project for the web version, reuse it —
 *  the phones will all share the same alerts.
 *
 *  1. Supabase -> Project Settings (gear) -> API
 *  2. Copy:
 *       SUPABASE_URL      = "Project URL"         (https://xxxx.supabase.co)
 *       SUPABASE_ANON_KEY = "anon / public" key   (a long "eyJ..." string)
 *  3. Make sure you have run supabase-schema.sql (from the web app folder) once.
 *
 *  The anon key is SAFE to ship in the app — your data is protected by the
 *  group code that everyone types in on first launch.
 * ============================================================================
 */
object Config {
    const val SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE"
    const val SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE"

    /** Cosmetic only — what the carers call the person being woken. */
    const val SLEEPER_NAME = "Mum"

    fun isConfigured(): Boolean =
        SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("PASTE_")
}
