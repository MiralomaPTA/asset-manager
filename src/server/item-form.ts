import type { Core } from "@/server/data";
import type { ItemRow } from "@/server/db/schema";
import type { ItemFormValues } from "@/components/ItemForm";

/** What the add/edit form needs from the snapshot. */
export function itemFormProps(core: Core, item: ItemRow | null, canSetOwner: boolean) {
  const values: ItemFormValues = item
    ? { id: item.id, name: item.name, description: item.description, tags: item.tags, location: item.location, quantity: item.quantity, ownerEmail: item.owner_email, contents: item.contents, photoId: item.photo_id }
    : { id: "", name: "", description: "", tags: [], location: "", quantity: "", ownerEmail: "", contents: [], photoId: "" };
  return {
    item: values,
    locations: core.locations.map((l) => l.name),
    knownTags: [...new Set(core.items.filter((i) => !i.archived).flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b)),
    owners: core.users
      .filter((u) => u.status === "approved")
      .map((u) => ({ email: u.email, label: u.name ? `${u.name} (${u.email})` : u.email }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    canSetOwner,
  };
}
