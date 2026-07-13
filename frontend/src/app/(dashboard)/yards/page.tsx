'use client';

import { Suspense } from 'react';
import YardBoardInner from './YardBoardInner';

export default function YardBoardPage() {
  return (
    <Suspense>
      <YardBoardInner />
    </Suspense>
  );
}
