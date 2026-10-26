import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Workflow } from "@/components/landing/workflow";
import { Ledger } from "@/components/landing/ledger";
import { ClosingCta, FieldsMarquee, SiteFooter } from "@/components/landing/closing";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <FieldsMarquee />
        <Features />
        <Workflow />
        <Ledger />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
