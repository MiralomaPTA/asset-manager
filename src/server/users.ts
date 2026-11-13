import { config } from "@/server/config";
import type { ItemRow, UserRow } from "@/server/db/schema";
import { shortName } from "@/lib/names";

/** Lookups over the Users tab. Emails are stored lowercased, so plain comparison works. */

export function findUser(users: readonly UserRow[], email: string): UserRow | undefined {
  const wanted = email.trim().toLowerCase();
  return users.find((u) => u.email === wanted);
}

export function isApproved(users: readonly UserRow[], email: string): boolean {
  return findUser(users, email)?.status === "approved";
}

export function isAdmin(user: UserRow | undefined): boolean {
  return user?.status === "approved" && user.role === "admin";
}

/**
 * Who hears about things that need an admin. With no admin in the Users tab
 * yet (first setup), the app's own mailbox gets them.
 */
export function adminEmails(users: readonly UserRow[]): string[] {
  const emails = users.filter(isAdmin).map((u) => u.email);
  return emails.length > 0 ? emails : [config.fromEmail];
}

/**
 * The approved user who decides an item's lines, or null when the admins do:
 * the item has no owner, or its owner isn't an approved user.
 */
export function ownerOf(item: Pick<ItemRow, "owner_email"> | undefined, users: readonly UserRow[]): UserRow | null {
  if (!item?.owner_email) return null;
  const owner = findUser(users, item.owner_email);
  return owner?.status === "approved" ? owner : null;
}

/** Can `user` decide, edit and mark returns for `item`? Its owner, or any admin. */
export function canManageItem(user: UserRow | undefined, item: Pick<ItemRow, "owner_email"> | undefined, users: readonly UserRow[]): boolean {
  if (!user || user.status !== "approved" || !item) return false;
  if (isAdmin(user)) return true;
  return ownerOf(item, users)?.email === user.email;
}

/** Who to email about an item: its owner, or every admin. */
export function itemContacts(item: Pick<ItemRow, "owner_email"> | undefined, users: readonly UserRow[]): string[] {
  const owner = ownerOf(item, users);
  return owner ? [owner.email] : adminEmails(users);
}

/** "Jordan R." for someone in the Users tab, or the email's local part. */
export function shortNameOf(users: readonly UserRow[], email: string): string {
  return shortName(findUser(users, email)?.name ?? "", email);
}

export function fullNameOf(users: readonly UserRow[], email: string): string {
  return findUser(users, email)?.name || email;
}
