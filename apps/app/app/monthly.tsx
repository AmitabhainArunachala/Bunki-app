import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { MonthlyTruthScreen } from '@/monthly/monthly-truth-screen';
import { RouteTitle } from '@/ui/route-title';

/** Route `/monthly` — an eight-lens projection of the canonical raw log. */
export default function MonthlyTruthRoute(): ReactNode {
  const router = useRouter();
  const { month } = useLocalSearchParams<{ month?: string }>();

  return (
    <>
      <RouteTitle href="/monthly" />
      <MonthlyTruthScreen
        onSelectMonth={(selected) => router.replace(`/monthly?month=${selected}`)}
        requestedMonth={typeof month === 'string' ? month : undefined}
      />
    </>
  );
}
