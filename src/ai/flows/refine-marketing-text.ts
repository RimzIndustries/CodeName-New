'use server';
/**
 * @fileOverview An AI agent that refines marketing text with different tones.
 *
 * - refineMarketingText - A function that refines the given marketing text with a specified tone.
 * - RefineMarketingTextInput - The input type for the refineMarketingText function.
 * - RefineMarketingTextOutput - The return type for the refineMarketingText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RefineMarketingTextInputSchema = z.object({
  textSnippet: z.string().describe('The snippet of marketing text to refine.'),
  tone: z.string().describe('The desired tone for the rewritten text (e.g., humorous, urgent, friendly, excited).'),
});
export type RefineMarketingTextInput = z.infer<typeof RefineMarketingTextInputSchema>;

const RefineMarketingTextOutputSchema = z.object({
  refinedText: z.string().describe('The rewritten marketing text with the specified tone.'),
});
export type RefineMarketingTextOutput = z.infer<typeof RefineMarketingTextOutputSchema>;

export async function refineMarketingText(input: RefineMarketingTextInput): Promise<RefineMarketingTextOutput> {
  return refineMarketingTextFlow(input);
}

const refineMarketingTextPrompt = ai.definePrompt({
  name: 'refineMarketingTextPrompt',
  input: {schema: RefineMarketingTextInputSchema},
  output: {schema: RefineMarketingTextOutputSchema},
  prompt: `Rewrite the following marketing text snippet with a {{{tone}}} tone:\n\n{{{textSnippet}}}`,
});

const refineMarketingTextFlow = ai.defineFlow(
  {
    name: 'refineMarketingTextFlow',
    inputSchema: RefineMarketingTextInputSchema,
    outputSchema: RefineMarketingTextOutputSchema,
  },
  async input => {
    const {output} = await refineMarketingTextPrompt(input);
    return output!;
  }
);
