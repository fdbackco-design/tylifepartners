import { notFound } from "next/navigation";
import ManagedLandingPage from "@/app/_components/ManagedLandingPage";
import { getManagedLandingBySlug } from "@/lib/managedLandings/store";

type Props = { params: Promise<{ slug: string }> };

export default async function ManagedLandingPublicPage({ params }: Props) {
  const { slug } = await params;
  const landing = await getManagedLandingBySlug(slug, { publishedOnly: true });
  if (!landing) notFound();

  return (
    <ManagedLandingPage
      id={landing.id}
      slug={landing.slug}
      path={landing.path}
      title={landing.title}
      hero1Url={landing.hero1_url}
      hero2Url={landing.hero2_url}
      showBrochure={landing.show_brochure}
      brochureUrl={landing.brochure_url}
      ctaPosition={landing.cta_position}
      sections={landing.sections}
    />
  );
}
