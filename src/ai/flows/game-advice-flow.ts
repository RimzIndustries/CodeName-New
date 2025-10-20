
'use server';
/**
 * @fileOverview An AI agent that provides game design and balancing advice.
 *
 * - getGameAdvice - A function that handles the game advice generation process.
 * - GameAdviceInput - The input type for the getGameAdvice function.
 * - GameAdviceOutput - The return type for the getadvice function.
 */

import {ai} from '@/ai/genkit';
import {googleAI} from '@genkit-ai/googleai';
import {z} from 'zod';

// Define the detailed schemas for game settings to be passed to the AI
const UnitCostsSchema = z.object({
  attack: z.number(),
  defense: z.number(),
  elite: z.number(),
  raider: z.number(),
  spy: z.number(),
});

const BuildingCostsSchema = z.object({
  residence: z.number(),
  farm: z.number(),
  fort: z.number(),
  university: z.number(),
  barracks: z.number(),
  mobility: z.number(),
  tambang: z.number(),
});

const BuildingEffectsSchema = z.object({
  residence: z.object({ unemployed: z.number(), capacity: z.number() }),
  farm: z.object({ unemployed: z.number(), food: z.number() }),
  fort: z.object({ unemployed: z.number(), defenseBonus: z.number() }),
  university: z.object({ unemployed: z.number(), eliteBonus: z.number(), constructionBonus: z.number() }),
  barracks: z.object({ unemployed: z.number(), trainingBonus: z.number() }),
  mobility: z.object({ unemployed: z.number(), attackBonus: z.number() }),
  tambang: z.object({ unemployed: z.number(), money: z.number() }),
});

const GameTitleSchema = z.object({
  id: z.string(),
  name: z.string(),
  prideRequired: z.number(),
  attackBonus: z.number(),
  defenseBonus: z.number(),
  resourceBonus: z.number(),
});

// Main input schema for the flow
const GameAdviceInputSchema = z.object({
  query: z.string().describe('The administrator\'s question or scenario for analysis.'),
  settings: z.object({
    initialResources: z.object({
      money: z.number(),
      food: z.number(),
      land: z.number(),
    }),
    globalBonuses: z.object({
      money: z.number(),
      food: z.number(),
    }),
    costs: z.object({
        units: UnitCostsSchema,
        buildings: BuildingCostsSchema,
    }),
    timing: z.object({
        constructionTime: z.number(),
        trainingTime: z.number(),
    }),
    effects: BuildingEffectsSchema,
    titles: z.array(GameTitleSchema),
    mechanics: z.object({
        votingPowerDivisor: z.number(),
    }),
  }).describe('A JSON object containing all the current game settings for context.'),
});
export type GameAdviceInput = z.infer<typeof GameAdviceInputSchema>;


const SuggestedChangesSchema = z.object({
  initialResources: z.object({
      money: z.number().optional(),
      food: z.number().optional(),
      land: z.number().optional(),
  }).optional(),
  globalBonuses: z.object({
      money: z.number().optional(),
      food: z.number().optional(),
  }).optional(),
  costs: z.object({
      units: UnitCostsSchema.partial().optional(),
      buildings: BuildingCostsSchema.partial().optional(),
  }).optional(),
  timing: z.object({
      constructionTime: z.number().optional(),
      trainingTime: z.number().optional(),
  }).optional(),
  effects: z.object({
    residence: z.object({ unemployed: z.number().optional(), capacity: z.number().optional() }).optional(),
    farm: z.object({ unemployed: z.number().optional(), food: z.number().optional() }).optional(),
    fort: z.object({ unemployed: z.number().optional(), defenseBonus: z.number().optional() }).optional(),
    university: z.object({ unemployed: z.number().optional(), eliteBonus: z.number().optional(), constructionBonus: z.number().optional() }).optional(),
    barracks: z.object({ unemployed: z.number().optional(), trainingBonus: z.number().optional() }).optional(),
    mobility: z.object({ unemployed: z.number().optional(), attackBonus: z.number().optional() }).optional(),
    tambang: z.object({ unemployed: z.number().optional(), money: z.number().optional() }).optional(),
  }).optional(),
  mechanics: z.object({
      votingPowerDivisor: z.number().optional(),
  }).optional(),
}).describe("A JSON object with the specific settings the AI suggests changing. Only include keys and values that should be modified. Do not include settings that should remain the same.");


const GameAdviceOutputSchema = z.object({
    analysis: z.string().describe("The AI's detailed analysis of the current game state based on the user's query. Formatted in Markdown."),
    recommendation: z.string().describe("The AI's specific recommendation to address the query. Formatted in Markdown."),
    potentialRisks: z.string().describe("Any potential risks or unintended consequences of implementing the recommendation. Formatted in Markdown."),
    suggestedChanges: SuggestedChangesSchema.optional()
});
export type GameAdviceOutput = z.infer<typeof GameAdviceOutputSchema>;

export async function getGameAdvice(input: GameAdviceInput): Promise<GameAdviceOutput> {
  return gameAdviceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'gameAdvicePrompt',
  model: googleAI.model('gemini-1.5-flash'),
  input: {schema: GameAdviceInputSchema},
  output: {schema: GameAdviceOutputSchema},
  prompt: `Anda adalah seorang ahli desainer dan analis keseimbangan game untuk sebuah game strategi multipemain berbasis web bernama 'Code Name'.

Anda akan diberikan pengaturan game saat ini dan sebuah pertanyaan dari administrator game. Tugas Anda adalah memberikan saran yang berwawasan, seimbang, dan dapat ditindaklanjuti. Analisis data yang diberikan untuk mengidentifikasi potensi ketidakseimbangan, eksploitasi, atau area untuk perbaikan.

Respons Anda HARUS dalam Bahasa Indonesia dan terdiri dari empat bagian:
1.  **analysis**: Penjelasan detail dan beralasan tentang observasi Anda dan 'mengapa' di balik setiap masalah yang Anda lihat.
2.  **recommendation**: Saran konkret Anda tentang apa yang harus diubah.
3.  **potentialRisks**: Tinjauan singkat tentang apa yang mungkin salah atau apa yang harus diwaspadai jika perubahan ini diterapkan.
4.  **suggestedChanges**: Objek JSON terstruktur yang HANYA berisi nilai-nilai spesifik yang Anda rekomendasikan untuk diubah. Jika sebuah nilai harus tetap sama, JANGAN sertakan dalam objek. Misalnya, jika pertanyaannya adalah "buat unit elit lebih murah" dan biaya saat ini adalah 950, \`suggestedChanges\` Anda mungkin \`{ "costs": { "units": { "elite": 800 } } }\`. Jangan sarankan perubahan pada gelar.

Pertanyaan Administrator:
"{{{query}}}"

Pengaturan Game Saat Ini:
\`\`\`json
{{{json settings}}}
\`\`\`
`,
});

const gameAdviceFlow = ai.defineFlow(
  {
    name: 'gameAdviceFlow',
    inputSchema: GameAdviceInputSchema,
    outputSchema: GameAdviceOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
