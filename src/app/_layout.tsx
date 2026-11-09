import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogHost } from '../components/dialog';
import { ErrorScreen, useNetworkWatcher } from '../components/feedback';
import { translate, type Lang } from '../i18n';
import { useStore } from '../store';
import { brand, ThemeProvider, useTheme } from '../theme';

function Shell() {
  const { c, isDark } = useTheme();
  const hydrated = useStore((s) => s.hydrated);
  const tick = useStore((s) => s.tick);
  useNetworkWatcher();

  // Auto-release timers and order progress. The server is the source of truth in
  // production; this keeps the UI honest while the app is open.
  useEffect(() => {
    tick();
    const id = setInterval(() => tick(), 30_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && tick());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [tick]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={brand.sky} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="capture" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="verify/liveness" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="verify/skill" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      <DialogHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Any crash in a screen lands here instead of a blank page. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const lang = (useStore.getState().settings?.language ?? 'en') as Lang;
  if (__DEV__) console.error(error);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorScreen title={translate(lang, 'error.title')} body={translate(lang, 'error.body')} onRetry={retry} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
