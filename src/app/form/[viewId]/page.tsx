import { FormFill } from "@/components/FormFill";

export default async function FormPage({ params }: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await params;
  return <FormFill viewId={viewId} />;
}
