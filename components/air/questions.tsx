'use client';
import { useMemo } from 'react';
import { FoldQuestions } from '@/components/preview/fold/questions';
import { ourWheel } from '@/components/preview/facts';

/* Questions on the day pages: the preview's questions and answers, in its open table */
/* finalists: the page's own count (the one How it works and the final say), so the page says one number */
export function DayQuestions({ finalists }: { finalists: number }) {
  const how = useMemo(() => ourWheel(null, { finalists }).how, [finalists]);
  return (
    <section id="questions" className="pf-part pf-q oa-part" data-part="questions" aria-labelledby="questions-h">
      <h2 id="questions-h" className="pf-h">Questions</h2>
      <FoldQuestions how={how} mode="open" />
    </section>
  );
}
