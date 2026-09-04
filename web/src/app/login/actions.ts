"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Only ever a path on this site: "//evil.example" and "https://…" are both
  // absolute to a browser, so anything but a single leading slash is dropped.
  const raw = String(formData.get("next") ?? "");
  const next = /^\/(?!\/)/.test(raw) ? raw : "/";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately generic: don't reveal whether the account exists.
    return { error: "Invalid email or password." };
  }

  revalidatePath("/", "layout");
  redirect(next);
}
