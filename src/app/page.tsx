import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { Story } from "@/components/landing/story";
import { ClosingCta, FieldsMarquee, SiteFooter } from "@/components/landing/closing";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <FieldsMarquee />
        {/* One anchor for both versions of the story, so "How it works" lands on whichever shows. */}
        <div id="how-it-works">
          <Story />
        </div>
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
