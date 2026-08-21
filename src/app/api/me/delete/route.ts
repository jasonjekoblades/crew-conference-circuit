import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/require-member";

// "Delete me and my data" (CLAUDE.md §8, §16) needs to go through the
// server, not a direct client .delete() call: even with the members-table
// DELETE grant fixed (20260821000002), a client session can only ever
// remove its OWN members row — it has no way to also remove the underlying
// Supabase anonymous auth user, since that requires the service role key,
// which never reaches the browser by design. Without this route, "delete
// my data" would leave a real, working anonymous session behind — inert
// (unlinked, so is_member() is false and it reads nothing) but not
// actually gone, which isn't what "delete me and my data" promises.
export async function POST(request: NextRequest) {
  const caller = await requireMember(request);
  if (!caller) {
    return NextResponse.json({ message: "Missing or invalid session." }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();

  const { data: row } = await admin.from("members").select("auth_user_id").eq("id", caller.id).maybeSingle();

  const { error: deleteError } = await admin.from("members").delete().eq("id", caller.id);
  if (deleteError) {
    return NextResponse.json({ message: "Couldn't delete your data. Try again." }, { status: 500 });
  }

  if (row?.auth_user_id) {
    await admin.auth.admin.deleteUser(row.auth_user_id);
  }

  return NextResponse.json({ ok: true });
}
