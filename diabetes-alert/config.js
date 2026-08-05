// ============================================================================
//  CONFIG — fill these two values in, then you're done.
// ============================================================================
//
//  1. Create a free project at https://supabase.com
//  2. In your project: Settings (gear) -> API
//  3. Copy the values below:
//        SUPABASE_URL       = "Project URL"          (looks like https://xxxx.supabase.co)
//        SUPABASE_ANON_KEY  = "anon / public API key" (a long "eyJ..." string)
//  4. Run the SQL in  supabase-schema.sql  (Supabase -> SQL Editor -> paste -> Run)
//
//  The anon key is SAFE to put in front-end code — that's what it's designed for.
//  Your data is protected by the group code (see README).
// ============================================================================

window.APP_CONFIG = {
  // Backend is already set up (project: boatyardjobs, table: night_alerts).
  // SUPABASE_ANON_KEY holds a modern Supabase "publishable" key — safe in front-end code.
  SUPABASE_URL:      "https://zpesevmnmaifnooqiyrr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_5WdjrD77OFZANghegb_4-w_fR4d582z",

  // Cosmetic only — change to whatever you call her.
  SLEEPER_NAME: "Mum",
};
