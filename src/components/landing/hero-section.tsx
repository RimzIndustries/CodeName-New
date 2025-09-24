import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RefinableText } from '@/components/ai/refinable-text';

const headlineText = "Unlock the Future of Innovation";
const subheadlineText = "Our revolutionary new product empowers you to create, innovate, and disrupt like never before. Experience the next generation of technology today.";

export function HeroSection() {
  return (
    <section className="w-full py-20 md:py-32 lg:py-40">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center space-y-6 text-center max-w-3xl mx-auto">
          <RefinableText text={headlineText} className="justify-center">
            <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/none font-headline">
              {headlineText}
            </h1>
          </RefinableText>
          <RefinableText text={subheadlineText} className="justify-center">
            <p className="max-w-[700px] text-foreground/80 md:text-xl">
              {subheadlineText}
            </p>
          </RefinableText>
          <div className="space-x-4 pt-4">
            <Button asChild size="lg">
              <Link href="#contact">Get Started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#features">Learn More</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
