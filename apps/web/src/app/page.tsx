import { getTestSummaries } from "@/lib/questions";
import { CatalogGate } from "@/components/CatalogGate";

export default async function CatalogPage() {
  const tests = await getTestSummaries();
  return <CatalogGate tests={tests} />;
}
