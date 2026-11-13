import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { loadCore } from "@/server/data";
import { itemFormProps } from "@/server/item-form";
import { canManageItem } from "@/server/users";
import { BackIcon } from "@/components/Icons";
import { ItemForm } from "@/components/ItemForm";

export default async function EditItemPage(props: PageProps<"/items/[id]/edit">) {
  const { id } = await props.params;
  const me = await requireMe(`/items/${id}/edit`);
  const core = await loadCore(await getDeps());
  const item = core.items.find((i) => i.id === id);
  if (!item || !canManageItem(me.user, item, core.users)) notFound();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link href={`/items/${item.id}`} className="-mb-2 inline-flex h-11 items-center gap-1 self-start text-[15px] font-semibold no-underline">
        <BackIcon />
        {item.name}
      </Link>
      <h1 className="h1">Edit {item.name}</h1>
      <ItemForm {...itemFormProps(core, item, me.isAdmin)} />
    </div>
  );
}
