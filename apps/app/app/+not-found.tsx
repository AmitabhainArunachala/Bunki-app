import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';

import { AppButton } from '@/ui/primitives';
import { RouteTitle } from '@/ui/route-title';
import { ScreenShell } from '@/ui/screen-shell';

/** An unknown link has a named destination and a way back into the app. */
export default function NotFoundRoute(): ReactNode {
  const router = useRouter();
  return (
    <>
      <RouteTitle href="/+not-found" />
      <ScreenShell
        subtitle="This link does not lead to a page in Bunki. You can return to Capture and continue."
        testID="screen-not-found"
        title="Page not found"
      >
        <AppButton
          accessibilityHint="Returns to your captures and search."
          label="Go to Capture"
          onPress={() => router.replace('/')}
          testID="not-found-capture"
        />
      </ScreenShell>
    </>
  );
}
