import { getTestSummaries } from "@/lib/questions";
import { TestCard } from "@/components/TestCard";

export default async function CatalogPage() {
  const tests = await getTestSummaries();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold text-testblue">GRE Mock Test Platform</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Choose a test. Questions are drawn from a pre-generated, verified bank — no waiting.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {tests.map((t) => (
          <TestCard key={t.id} test={t} />
        ))}
      </section>
    </main>
  );
}
