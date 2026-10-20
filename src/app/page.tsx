import { brand } from "@/shared/brand";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-3xl">{brand.tagline}</h1>
      <p className="mt-3 text-text-muted">{brand.steps.join(" ")}</p>
    </main>
  );
}
