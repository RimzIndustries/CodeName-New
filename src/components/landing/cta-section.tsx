import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefinableText } from '../ai/refinable-text';

const ctaHeadline = "Ready to take the next step?";
const ctaSubheadline = "Join thousands of satisfied customers and revolutionize your workflow. Get started with our product today and unlock your full potential.";

export function CtaSection() {
  return (
    <section className="w-full py-12 md:py-24 lg:py-32 bg-card">
      <div className="container grid items-center justify-center gap-4 px-4 text-center md:px-6">
        <div className="space-y-4">
          <RefinableText text={ctaHeadline} className="justify-center">
            <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight font-headline">
              {ctaHeadline}
            </h2>
          </RefinableText>
          <RefinableText text={ctaSubheadline} className="justify-center">
            <p className="mx-auto max-w-[600px] text-foreground/80 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              {ctaSubheadline}
            </p>
          </RefinableText>
        </div>
        <div className="flex flex-col gap-2 min-[400px]:flex-row justify-center pt-4">
          <Button asChild size="lg">
            <Link href="#contact">Contact Sales</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="#features">Explore Features</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
