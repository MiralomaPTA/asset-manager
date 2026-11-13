"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface Tab {
  href: string;
  label: string;
  badge?: number;
}

/** The tab row under the header; the current section is underlined. */
export function NavTabs({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  const current = (href: string) => (href === "/" ? path === "/" || path.startsWith("/items") : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="Main" className="-mb-px flex">
      {tabs.map((tab) => {
        const on = current(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={`flex h-11 flex-1 items-center justify-center gap-1.5 border-b-[3px] text-sm no-underline sm:flex-none sm:px-5 ${
              on ? "border-brand font-bold text-ink hover:text-ink" : "border-transparent font-semibold text-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.badge ? <span className="rounded-full bg-brand px-1.5 py-px text-xs font-bold text-white">{tab.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
