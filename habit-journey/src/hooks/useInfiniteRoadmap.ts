import { useCallback, useMemo, useState } from 'react';
import { getMilestones } from '@/data/habitTips';
import { contentWidthFor } from '@/lib/layout';
import type { InfiniteRoadmapOptions, InfiniteRoadmapResult } from '@/types';

export function useInfiniteRoadmap(options: InfiniteRoadmapOptions): InfiniteRoadmapResult {
  const { initialCount, threshold, batchSize } = options;

  const [count, setCount] = useState(initialCount);

  const milestones = useMemo(() => getMilestones(count), [count]);
  const contentWidth = useMemo(() => contentWidthFor(count), [count]);

  const ensureIndexLoaded = useCallback(
    (index: number) => {
      setCount((current) => {
        if (index <= current - threshold) return current;
        const next = Math.max(current, index + batchSize);
        return next > current ? next : current;
      });
    },
    [threshold, batchSize],
  );

  return { milestones, contentWidth, ensureIndexLoaded };
}
