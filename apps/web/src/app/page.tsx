import Link from "next/link";
import { getTestSummaries } from "@/lib/questions";

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
          <Link
            key={t.id}
            href={`/test/${t.id}`}
            className="block rounded-lg border border-testline bg-white p-5 shadow-sm transition hover:border-testblue hover:shadow"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {t.kind.replace("_", " ")}
            </div>
            <h2 className="mt-1 text-lg font-semibold">{t.name}</h2>
            <div className="mt-3 flex gap-4 text-sm text-neutral-600">
              <span>{t.questionCount} questions</span>
              <span>{Math.round(t.timeLimitSeconds / 60)} min</span>
            </div>
            <div className="mt-4 inline-block rounded bg-testblue px-4 py-1.5 text-sm font-medium text-white">
              Start
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
