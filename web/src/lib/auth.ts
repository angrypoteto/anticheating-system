import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "STUDENT" | "INSTRUCTOR" | "ADMIN";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, role, status, section_id")
    .eq("id", user.id)
    .single();

  return profile;
}

export async function requireRole(...allowed: Role[]) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  if (profile.status !== "ACTIVE") redirect("/login?error=disabled");
  if (!allowed.includes(profile.role as Role)) redirect("/");
  return profile;
}
