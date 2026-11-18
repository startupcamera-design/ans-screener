import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

// Hanya dipakai di route handler (server). JANGAN impor dari komponen klien.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Verifikasi token login Supabase dan cocokkan email dengan ADMIN_EMAIL.
export async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return "Belum login";
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return "Sesi tidak valid";
  const admin = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!admin || data.user.email?.toLowerCase() !== admin) return "Bukan admin";
  return null;
}
