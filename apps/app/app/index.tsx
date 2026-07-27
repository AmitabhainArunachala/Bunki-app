import { StyleSheet, Text, View } from 'react-native';

import { SCAFFOLD_NOTICE } from '@/state/scaffold';

/**
 * WP-01 scaffold route. It exists so `expo export --platform web` has something
 * real to build and so CI proves the toolchain end to end.
 *
 * It deliberately claims nothing about the product. The capture screen
 * (controller §10 screen 1) is WP-05's deliverable.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        分岐
      </Text>
      <Text style={styles.body}>{SCAFFOLD_NOTICE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    maxWidth: 420,
    textAlign: 'center',
  },
});
