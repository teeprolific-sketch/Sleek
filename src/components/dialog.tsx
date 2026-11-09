import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { radius, space, useTheme } from '../theme';
import { Button, Txt } from './ui';

/**
 * In-app dialog used on web, where browser alert()/confirm() are ugly and are
 * blocked in some embedded viewers. Native keeps the platform Alert.
 */
interface DialogReq {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
}

let listener: ((d: DialogReq | null) => void) | null = null;
const queue: DialogReq[] = [];

export function openDialog(d: DialogReq) {
  queue.push(d);
  if (queue.length === 1) listener?.(d);
}

function next() {
  queue.shift();
  listener?.(queue[0] ?? null);
}

export function DialogHost() {
  const { c } = useTheme();
  const [d, setD] = useState<DialogReq | null>(queue[0] ?? null);
  useEffect(() => {
    listener = setD;
    return () => {
      listener = null;
    };
  }, []);
  if (!d) return null;
  const isConfirm = !!d.onConfirm;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={next}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: space.lg }} onPress={isConfirm ? undefined : next} accessibilityRole="alert">
        <Pressable style={{ width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm }}>
          <Txt v="h3">{d.title}</Txt>
          {d.message ? <Txt muted>{d.message}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            {isConfirm ? <Button variant="ghost" title="Not now" full={false} style={{ flex: 1 }} onPress={next} /> : null}
            <Button
              title={isConfirm ? d.confirmLabel ?? 'OK' : 'OK'}
              variant={d.destructive ? 'danger' : 'primary'}
              full={false}
              style={{ flex: 1 }}
              onPress={() => {
                const fn = d.onConfirm;
                next();
                fn?.();
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
