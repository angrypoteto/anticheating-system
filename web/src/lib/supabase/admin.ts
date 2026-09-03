// Importing this from a Client Component is a build error — the secret key
// bypasses RLS entirely and must never reach the browser.
import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
