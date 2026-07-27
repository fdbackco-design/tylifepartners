import LandingEditorClient from "@/app/admin/landings/[id]/LandingEditorClient";

type Props = { params: Promise<{ id: string }> };

export default async function AdminLandingEditPage({ params }: Props) {
  const { id } = await params;
  return <LandingEditorClient landingId={id} />;
}
