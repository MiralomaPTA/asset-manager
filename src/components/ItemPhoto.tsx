import { BoxIcon } from "@/components/Icons";

/** Soft backgrounds for items without a photo, picked by name so each item keeps its color. */
const PLACEHOLDERS = ["bg-brand-soft", "bg-warn-soft", "bg-ok-soft", "bg-rule"];

function placeholderFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PLACEHOLDERS[hash % PLACEHOLDERS.length];
}

/**
 * An item's photo, served by the app to signed-in users only, or a plain
 * placeholder. Photos are never public Drive links.
 */
export function ItemPhoto({ id, name, className = "", iconSize = 40 }: { id: string; name: string; className?: string; iconSize?: number }) {
  if (id) {
    // eslint-disable-next-line @next/next/no-img-element -- served by our own signed-in route, already sized
    return <img src={`/photos/${id}`} alt={`Photo of the ${name.toLowerCase()}`} className={`object-cover ${className}`} loading="lazy" decoding="async" />;
  }
  return (
    <div role="img" aria-label="No photo yet" className={`flex items-center justify-center text-body ${placeholderFor(name)} ${className}`}>
      <BoxIcon size={iconSize} strokeWidth={1.4} />
    </div>
  );
}
