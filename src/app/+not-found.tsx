import { Stack } from 'expo-router';
import React from 'react';
import { ErrorScreen } from '../components/feedback';
import { useT } from '../i18n';

export default function NotFound() {
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ErrorScreen icon="compass-outline" title={t('notFound.title')} body={t('notFound.body')} />
    </>
  );
}
