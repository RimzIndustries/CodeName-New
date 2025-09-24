import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { RefinableText } from '../ai/refinable-text';

const testimonials = [
  {
    name: "Jane Doe",
    title: "CEO, Innovate Inc.",
    image: PlaceHolderImages.find(p => p.id === 'testimonial-1'),
    quote: "This product has completely transformed our workflow. We're more efficient and productive than ever before. It's a game-changer!",
  },
  {
    name: "John Smith",
    title: "Marketing Director, Growth Co.",
    image: PlaceHolderImages.find(p => p.id === 'testimonial-2'),
    quote: "I was skeptical at first, but the results speak for themselves. Our conversion rates have skyrocketed since we started using it.",
  },
  {
    name: "Sarah Jones",
    title: "Lead Developer, Tech Solutions",
    image: PlaceHolderImages.find(p => p.id === 'testimonial-3'),
    quote: "As a developer, I appreciate the clean code and excellent documentation. It's a joy to work with and integrate into our existing systems.",
  },
];

export function SocialProofSection() {
  return (
    <section className="w-full py-12 md:py-24 lg:py-32">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">Loved by Professionals</h2>
            <p className="max-w-[900px] text-foreground/80 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              See what our amazing customers have to say about their experience.
            </p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="flex flex-col">
              <CardContent className="pt-6 flex-grow">
                <RefinableText text={testimonial.quote}>
                  <blockquote className="text-lg leading-relaxed italic">
                    "{testimonial.quote}"
                  </blockquote>
                </RefinableText>
              </CardContent>
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <Avatar>
                    {testimonial.image && <AvatarImage src={testimonial.image.imageUrl} alt={testimonial.name} data-ai-hint={testimonial.image.imageHint} width={100} height={100} />}
                    <AvatarFallback>{testimonial.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.title}</p>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
