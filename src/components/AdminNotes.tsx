import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { AdminNote } from '../domain/types';
import { useStore } from '../store';
import { radius, space, useTheme } from '../theme';
import { day, time } from '../utils/format';
import { showMessage } from './domain';
import { Button, Field, Icon, Row, Section, Txt } from './ui';

/** Internal admin notes. Never visible to customers or artisans. */
export function AdminNotes({ targetType, targetId }: { targetType: AdminNote['targetType']; targetId: string }) {
  const { c } = useTheme();
  const all = useStore((s) => s.adminNotes);
  const admins = useStore((s) => s.admins);
  const add = useStore((s) => s.addAdminNote);
  const notes = useMemo(() => all.filter((n) => n.targetType === targetType && n.targetId === targetId), [all, targetType, targetId]);
  const [text, setText] = useState('');
  return (
    <Section title={`Internal notes (${notes.length})`}>
      <Row gap={6} style={{ marginBottom: space.sm }}>
        <Icon name="lock-closed" size={12} color={c.textMuted} />
        <Txt v="tiny" muted>
          ADMIN-ONLY · NOT VISIBLE TO USERS
        </Txt>
      </Row>
      {notes.map((n) => (
        <View key={n.id} style={{ padding: space.sm, borderRadius: radius.sm, backgroundColor: c.warningSoft, marginBottom: 6 }}>
          <Txt v="small">{n.text}</Txt>
          <Txt v="tiny" muted>
            {admins.find((a) => a.id === n.by)?.name ?? n.by} · {day(n.at)} {time(n.at)}
          </Txt>
        </View>
      ))}
      <Field placeholder="Add a note for other reviewers…" value={text} onChangeText={setText} multiline />
      <Button
        small
        variant="secondary"
        title="Add note"
        onPress={() => {
          const r = add(targetType, targetId, text);
          if (!r.ok) return showMessage('Note not saved', r.error);
          setText('');
        }}
      />
    </Section>
  );
}
