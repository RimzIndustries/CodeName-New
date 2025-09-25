
'use client';

import * as React from 'react';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';

// The props are kept the same so we don't have to change the call site as much,
// even though they are not used in this placeholder implementation.
interface User {
  id: string;
  prideName: string;
  pride: number;
  province: string;
  role: 'admin' | 'user';
}

interface Title {
  id: string;
  name: string;
  prideRequired: number;
}

interface IndonesiaMapProps {
  users: User[];
  titles: Title[];
}

export function IndonesiaMap({ users, titles }: IndonesiaMapProps) {
  // Since the map is disabled due to a billing issue, we show a placeholder.
  // This prevents the application from crashing and informs the user of the problem.
  return (
    <div className="w-full h-[600px] flex flex-col items-center justify-center bg-muted p-4 space-y-4">
      <Alert variant="destructive">
        <Terminal className="h-4 w-4" />
        <AlertTitle>Google Maps Error: Billing Not Enabled</AlertTitle>
        <AlertDescription>
          The interactive map cannot be displayed because billing is not enabled for the associated Google Cloud project. 
          Please enable billing in the Google Cloud Console for your project to restore map functionality.
          A placeholder image is shown below.
        </AlertDescription>
      </Alert>
      <div className="relative w-full flex-1">
        <Image
          src="https://placehold.co/1200x800.png"
          alt="Placeholder map of Indonesia"
          fill
          style={{ objectFit: 'cover' }}
          className="rounded-md"
          data-ai-hint="indonesia map"
        />
      </div>
    </div>
  );
}
