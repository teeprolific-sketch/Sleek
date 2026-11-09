import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { ErrorScreen } from '../components/feedback';
import { useT } from '../i18n';
import { DEMO_CAPTURE } from '../utils/demo';

// A hosted web preview opens the app at the host's own path; send that first load home.
let firstLoad = true;

export default function NotFound() {
  const t = useT();
  if (firstLoad && DEMO_CAPTURE && Platform.OS === 'web') {
    firstLoad = false;
    return <Redirect href="/" />;
  }
  firstLoad = false;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ErrorScreen icon="compass-outline" title={t('notFound.title')} body={t('notFound.body')} />
    </>
  );
}
