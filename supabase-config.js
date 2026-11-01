// These values are public browser configuration, never use service_role or sb_secret keys.
window.LOVE_SUPABASE = Object.freeze({
  url: '', // https://YOUR_PROJECT.supabase.co
  publishableKey: '', // sb_publishable_... (or legacy anon key)
  journalId: '' // UUID returned by supabase-setup.sql
});
