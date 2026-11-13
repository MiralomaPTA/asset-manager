import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import logo from "@/images/miraloma-logo.png";
import { getDeps } from "@/server/adapters";
import { getMe } from "@/server/auth/session";
import { readCart } from "@/server/cart";
import { config } from "@/server/config";
import { linesToDecide, loadCore, ownsAnything } from "@/server/data";
import { ClipboardIcon } from "@/components/Icons";
import { NavTabs, type Tab } from "@/components/NavTabs";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PTA Equipment · Miraloma PTA",
  description: "Borrow the Miraloma PTA's tables, chairs, coolers and more for school events.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const me = await getMe();
  let tabs: Tab[] = [];
  let cartCount = 0;
  if (me) {
    const core = await loadCore(await getDeps());
    const cart = await readCart();
    cartCount = cart.length;
    tabs = [
      { href: "/", label: "Catalog" },
      { href: "/calendar", label: "Calendar" },
      { href: "/requests", label: "My requests" },
    ];
    if (me.isAdmin || ownsAnything(core, me.user)) tabs.push({ href: "/review", label: "Review", badge: linesToDecide(core, me.user).length });
  }
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 pt-3">
            <div className="flex items-center justify-between gap-3 pb-1">
              <Link href="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
                <Image src={logo} alt="" width={36} height={36} priority className="h-9 w-9 rounded-full" />
                <span className="flex flex-col">
                  <span className="text-base leading-tight font-extrabold">PTA Equipment</span>
                  <span className="text-xs text-muted">Miraloma PTA</span>
                </span>
              </Link>
              {me && (
                <Link href="/request" className="btn-soft btn-small h-11 rounded-full px-3.5 text-sm">
                  <ClipboardIcon />
                  Request{cartCount > 0 ? ` (${cartCount})` : ""}
                </Link>
              )}
            </div>
            {me && <NavTabs tabs={tabs} />}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-10">{children}</main>
        <footer className="space-y-2 border-t border-line px-4 py-6 text-center text-xs text-muted">
          {me && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <span>Signed in as {me.email}</span>
              {me.isAdmin && <Link href="/admin">Admin</Link>}
              <form action="/api/auth/signout" method="post" className="inline">
                <button type="submit" className="cursor-pointer text-brand underline-offset-2 hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          )}
          <p>
            <Link href="/help">How borrowing works</Link> · Questions? Email <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>
          </p>
          <p>
            Made by the{" "}
            <a href="https://www.miralomasf.com/pta" target="_blank" rel="noopener noreferrer">
              Miraloma PTA
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
