import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeps } from "@/server/adapters";
import { requireMe } from "@/server/auth/session";
import { loadCore } from "@/server/data";
import { itemFormProps } from "@/server/item-form";
import { BackIcon } from "@/components/Icons";
import { ItemForm } from "@/components/ItemForm";

export default async function NewItemPage() {
  const me = await requireMe("/items/new");
  if (!me.isAdmin) notFound();
  const core = await loadCore(await getDeps());
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <Link href="/" className="-mb-2 inline-flex h-11 items-center gap-1 self-start text-[15px] font-semibold no-underline">
        <BackIcon />
        Catalog
      </Link>
      <h1 className="h1">Add an item</h1>
      <ItemForm {...itemFormProps(core, null, true)} />
    </div>
  );
}
