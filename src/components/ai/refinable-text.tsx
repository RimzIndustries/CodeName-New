import { ContentRefiner } from '@/components/ai/content-refiner';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface RefinableTextProps {
  children: ReactNode;
  text: string;
  className?: string;
}

export function RefinableText({ children, text, className }: RefinableTextProps) {
  return (
    <div className={cn("group flex items-start gap-x-2", className)}>
      <div className="flex-grow">{children}</div>
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <ContentRefiner text={text} />
      </div>
    </div>
  );
}
