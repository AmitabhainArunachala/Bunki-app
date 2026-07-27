import { Stack } from 'expo-router';

/**
 * Root layout. Shared across every screen, so per orchestration spec §4 this
 * file stays with the builder who owns the app shell; other builders request
 * changes through the Conductor rather than editing it directly.
 *
 * WP-01 scaffold: navigation container only. Screens land in WP-05/08/09.
 */
export default function RootLayout() {
  return <Stack />;
}
