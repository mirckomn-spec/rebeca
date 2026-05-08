import "server-only";
import type { UserRole } from "./auth";

export const ALLOWED_USERS: Record<string, string> = {
  bel: "bel94838",
  camila: "camila23968",
  miguel: "miguel57382",
  isa: "isa87538",
  amanda: "amanda96389",
  duda: "duda23968",
  andre: "andre67384",
  perk: "perk98460",
  neat: "neat92359",
};

export function getUserRole(username: string): UserRole {
  return username === "bel" ? "admin" : "member";
}

export function getMemberUsernames() {
  return Object.keys(ALLOWED_USERS).filter((user) => user !== "bel");
}
