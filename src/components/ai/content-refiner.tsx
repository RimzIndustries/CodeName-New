'use client';

import { useState } from 'react';
import { refineMarketingText } from '@/ai/flows/refine-marketing-text';
import { Wand2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const tones = ['Humorous', 'Urgent', 'Friendly', 'Excited', 'Professional', 'Witty'];

interface ContentRefinerProps {
  text: string;
}

export function ContentRefiner({ text }: ContentRefinerProps) {
  const [open, setOpen] = useState(false);
  const [selectedTone, setSelectedTone] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refinedText, setRefinedText] = useState('');
  const { toast } = useToast();

  const handleRefine = async (tone: string) => {
    setSelectedTone(tone);
    setIsLoading(true);
    setRefinedText('');
    try {
      const result = await refineMarketingText({ textSnippet: text, tone });
      if (result.refinedText) {
        setRefinedText(result.refinedText);
      } else {
        throw new Error('AI could not refine the text.');
      }
    } catch (error) {
      console.error('Error refining text:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to refine text. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-accent opacity-50 hover:opacity-100 transition-opacity"
          aria-label="Refine Content with AI"
        >
          <Wand2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Refine Content with AI</DialogTitle>
          <DialogDescription>
            Select a tone to rewrite the text and see how different language could perform better.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div>
            <h4 className="font-medium text-sm mb-2 text-muted-foreground">Original Text</h4>
            <p className="text-sm p-4 bg-muted/50 rounded-md border">{text}</p>
          </div>
          <div>
            <h4 className="font-medium text-sm mb-2 text-muted-foreground">Choose a Tone</h4>
            <div className="flex flex-wrap gap-2">
              {tones.map((tone) => (
                <Button
                  key={tone}
                  variant={selectedTone === tone ? 'default' : 'outline'}
                  onClick={() => handleRefine(tone)}
                  disabled={isLoading}
                >
                  {isLoading && selectedTone === tone ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {tone}
                </Button>
              ))}
            </div>
          </div>
          { (isLoading || refinedText) && (
            <div>
              <h4 className="font-medium text-sm mb-2 text-muted-foreground">Refined Text</h4>
              <Card>
                <CardContent className="p-4">
                  {isLoading ? (
                    <div className="flex items-center space-x-2 text-muted-foreground min-h-[100px] justify-center">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Refining...</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm min-h-[100px]">{refinedText}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(refinedText);
                          toast({ title: "Copied to clipboard!" });
                        }}
                      >
                        Copy Text
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
