import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import CodeLandingRuntime from "@/app/_components/CodeLandingRuntime";
import ManagedLandingPage from "@/app/_components/ManagedLandingPage";
import { getManagedLandingBySlug } from "@/lib/managedLandings/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ slug: string }> };

export default async function ManagedLandingPublicPage({ params }: Props) {
  noStore();
  const { slug } = await params;
  const landing = await getManagedLandingBySlug(slug, { publishedOnly: true });
  if (!landing) notFound();

  if (landing.kind === "code") {
    if (!landing.code_bundle_url) notFound();
    return (
      <CodeLandingRuntime
        id={landing.id}
        slug={landing.slug}
        path={landing.path}
        title={landing.title}
        bundleUrl={landing.code_bundle_url}
        cssUrl={landing.code_css_url}
        sections={landing.sections}
        formConfig={landing.form_config}
      />
    );
  }

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
      formConfig={landing.form_config}
    />
  );
}
