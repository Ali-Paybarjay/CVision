import Link from "next/link";
import { navItems } from "@/shared/navigation";

export function SiteNav() {
  return (
    <header className="border-b">
      <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 py-3">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="text-sm hover:underline">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
