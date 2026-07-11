import { notFound } from "next/navigation";
import { getTestDef } from "@/lib/questions";
import { FullTestEngine } from "@/components/FullTestEngine";

export default async function TestPage({ params }: { params: { id: string } }) {
  const test = await getTestDef(params.id);
  if (!test) notFound();
  return <FullTestEngine test={test} />;
}
