import { Zap, ShieldCheck, BarChart } from 'lucide-react';
import { RefinableText } from '../ai/refinable-text';

const features = [
  {
    icon: <Zap className="h-8 w-8 text-primary" />,
    title: "Blazing Fast Performance",
    description: "Experience unparalleled speed and responsiveness. Our product is optimized for performance, ensuring a seamless user experience.",
  },
  {
    icon: <ShieldCheck className="h-8 w-8 text-primary" />,
    title: "Rock-Solid Security",
    description: "Your data is safe with us. We employ state-of-the-art security measures to protect your information at all times.",
  },
  {
    icon: <BarChart className="h-8 w-8 text-primary" />,
    title: "Advanced Analytics",
    description: "Gain valuable insights with our powerful analytics dashboard. Make data-driven decisions to grow your business.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="w-full py-12 md:py-24 lg:py-32 bg-card">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">Key Features</h2>
            <p className="max-w-[900px] text-foreground/80 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Discover the powerful features that make our product the best choice for you.
            </p>
          </div>
        </div>
        <div className="mx-auto grid max-w-5xl items-start gap-12 sm:grid-cols-2 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="grid gap-4 text-center">
              <div className="flex justify-center">{feature.icon}</div>
              <h3 className="text-xl font-bold font-headline">{feature.title}</h3>
              <RefinableText text={feature.description}>
                <p className="text-sm text-foreground/80">{feature.description}</p>
              </RefinableText>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
