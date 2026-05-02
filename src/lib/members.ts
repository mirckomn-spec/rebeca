import { getDbSafe } from "@/lib/mongodb";
import { getPermanentlyRemovedUsernameSet } from "@/lib/site-users";
import { ALLOWED_USERS } from "@/lib/users";

/**
 * Lista membros para ranking/metas: uniao dos usuarios estaticos legados
 * com usuarios criados no MongoDB, excluindo contas encerradas ou apagadas
 * definitivamente (removed_site_users).
 */
export async function listMemberUsernames(): Promise<string[]> {
  const staticMembers = Object.keys(ALLOWED_USERS).filter((u) => u !== "bel");
  const { db } = await getDbSafe();
  if (!db) {
    return staticMembers.sort();
  }

  const [activeRows, deletedRows, removedSet] = await Promise.all([
    db
      .collection("site_users")
      .find({ role: "member", deleted: { $ne: true } })
      .project({ username: 1 })
      .toArray(),
    db
      .collection("site_users")
      .find({ deleted: true })
      .project({ username: 1 })
      .toArray(),
    getPermanentlyRemovedUsernameSet(db),
  ]);

  const deletedSet = new Set(
    deletedRows.map((row) => String(row.username ?? "").toLowerCase()),
  );
  const combined = new Set<string>();
  for (const name of staticMembers) {
    const n = name.toLowerCase();
    if (!deletedSet.has(n) && !removedSet.has(n)) combined.add(n);
  }
  for (const row of activeRows) {
    const name = String(row.username ?? "").toLowerCase();
    if (name && name !== "bel" && !deletedSet.has(name) && !removedSet.has(name)) {
      combined.add(name);
    }
  }
  return Array.from(combined).sort();
}
