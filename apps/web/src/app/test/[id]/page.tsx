import { notFound } from "next/navigation";
import { getTest } from "@/lib/questions";
import { TestEngine } from "@/components/TestEngine";

export default async function TestPage({ params }: { params: { id: string } }) {
  const test = await getTest(params.id);
  if (!test) notFound();
  return <TestEngine test={test} />;
}
