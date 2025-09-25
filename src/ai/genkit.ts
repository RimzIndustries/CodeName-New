import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {googleCloud} from '@genkit-ai/google-cloud';

export const ai = genkit({
  plugins: [
    googleAI(),
    // The Google Cloud plugin is required for production deployments.
    // It is removed here to prevent conflicts in local development.
    // googleCloud,
  ],
});
