import Link from "next/link";
import { navItems } from "@/shared/navigation";
import { Wordmark } from "@/shared/ui/wordmark";

export function SiteNav() {
  return (
    <header className="border-b border-line bg-surface">
      <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="mr-2 text-xl">
          <Wordmark />
        </Link>
        {navItems
          .filter((item) => item.href !== "/")
          .map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-text-muted hover:text-accent">
              {item.label}
            </Link>
          ))}
      </nav>
    </header>
  );
}
