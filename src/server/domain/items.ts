import { byKey } from "@/server/db/db";
import { blankRow, type ItemRow } from "@/server/db/schema";
import { locationOf, loadCore } from "@/server/data";
import { fail, formatId, logActivity, maxSequence, type DomainDeps, type Result } from "@/server/domain/common";
import { PhotoError, storeItemPhoto } from "@/server/photos";
import { canManageItem, findUser, isAdmin } from "@/server/users";

/**
 * Adding and editing items. Admins do everything; an item's owner edits
 * everything about it except who owns it and whether it is archived.
 */

export interface ItemFields {
  name: string;
  description: string;
  tags: string[];
  location: string;
  quantity: number;
  /** Admins only; ignored for owners. Blank means the admins look after it. */
  ownerEmail: string;
  contents: string[];
}

export interface SaveItemInput {
  actorEmail: string;
  /** Blank to add a new item. */
  itemId: string;
  fields: ItemFields;
  photo?: Uint8Array;
}

function clean(list: string[], max: number, each: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = raw.replace(/,/g, " ").trim().slice(0, each);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out.slice(0, max);
}

export async function saveItem(input: SaveItemInput, deps: DomainDeps): Promise<Result<{ itemId: string }>> {
  deps.db.invalidate();
  const core = await loadCore(deps);
  const now = deps.now().toISOString();
  const actor = findUser(core.users, input.actorEmail);
  const admin = isAdmin(actor);
  const existing = input.itemId ? core.items.find((i) => i.id === input.itemId) : undefined;
  if (input.itemId && !existing) return fail("That item doesn't exist.");
  if (existing ? !canManageItem(actor, existing, core.users) : !admin) return fail("Only admins add items, and only an item's owner or an admin can edit it.");

  const f = input.fields;
  const name = f.name.trim();
  if (!name) return fail("Give the item a name.", { field: "name" });
  if (name.length > 80) return fail("Keep the name under 80 characters.", { field: "name" });
  const description = f.description.trim();
  if (description.length > 2000) return fail("Keep the description under 2,000 characters.", { field: "description" });
  if (!Number.isInteger(f.quantity) || f.quantity < 0 || f.quantity > 9999) return fail("Enter how many the PTA has, as a whole number.", { field: "quantity" });
  let location = f.location.trim();
  if (core.locations.length > 0) {
    const known = locationOf(core, location);
    if (!known) return fail("Choose where it's kept.", { field: "location" });
    location = known.name;
  } else if (!location) {
    return fail("Say where it's kept.", { field: "location" });
  }
  let ownerEmail = existing?.owner_email ?? "";
  if (admin) {
    ownerEmail = f.ownerEmail.trim().toLowerCase();
    if (ownerEmail && findUser(core.users, ownerEmail)?.status !== "approved") {
      return fail("The owner must be someone approved to use the site. Leave it blank for the admins.", { field: "ownerEmail" });
    }
  }

  const values: Partial<ItemRow> = {
    name,
    description,
    tags: clean(f.tags, 10, 30),
    location,
    quantity: f.quantity,
    owner_email: ownerEmail,
    contents: clean(f.contents, 30, 60),
    updated_at: now,
  };
  if (input.photo && input.photo.byteLength > 0) {
    try {
      const { photoId, thumbId } = await storeItemPhoto(deps.files, input.photo, actor!.email, name);
      values.photo_id = photoId;
      values.thumb_id = thumbId;
    } catch (error) {
      if (error instanceof PhotoError) return fail(error.message, { field: "photo" });
      throw error;
    }
  }

  if (existing) {
    const outcome = await deps.db.update("items", [{ match: byKey("items", existing.id), patch: values }]);
    if (!outcome.ok) return fail("That item was removed from the Sheet. Reload the page.");
    await logActivity(deps, actor!.email, [{ action: "edited item", item_id: existing.id, detail: describeChanges(existing, values) }]);
    return { ok: true, itemId: existing.id };
  }
  const id = formatId("I-", maxSequence(core.items.map((i) => i.id), "I-") + 1);
  await deps.db.append("items", [{ ...blankRow("items"), ...values, id, created_at: now }]);
  await logActivity(deps, actor!.email, [{ action: "added item", item_id: id, detail: `${name} × ${f.quantity}` }]);
  return { ok: true, itemId: id };
}

function describeChanges(before: ItemRow, after: Partial<ItemRow>): string {
  const changed: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (key === "updated_at") continue;
    const old = before[key as keyof ItemRow];
    if (JSON.stringify(old) !== JSON.stringify(value)) changed.push(key === "quantity" ? `quantity ${old} to ${value}` : key);
  }
  return changed.join(", ") || "no changes";
}

export async function setArchived(input: { actorEmail: string; itemId: string; archived: boolean }, deps: DomainDeps): Promise<Result> {
  deps.db.invalidate();
  const core = await loadCore(deps);
  if (!isAdmin(findUser(core.users, input.actorEmail))) return fail("Only admins archive items.");
  const item = core.items.find((i) => i.id === input.itemId);
  if (!item) return fail("That item doesn't exist.");
  const outcome = await deps.db.update("items", [{ match: byKey("items", item.id), patch: { archived: input.archived, updated_at: deps.now().toISOString() } }]);
  if (!outcome.ok) return fail("That item was removed from the Sheet. Reload the page.");
  await logActivity(deps, input.actorEmail, [{ action: input.archived ? "archived item" : "unarchived item", item_id: item.id, detail: item.name }]);
  return { ok: true };
}
