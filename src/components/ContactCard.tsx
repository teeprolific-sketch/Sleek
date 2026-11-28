import React from 'react';
import { Linking, Platform } from 'react-native';
import { Button, Card, Icon, Row, Txt } from './ui';
import { space, useTheme } from '../theme';
import { maskPhone } from '../utils/format';

/** Formats +2348031234567 as 0803 123 4567. */
export function localPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  const local = d.startsWith('234') ? `0${d.slice(3)}` : d;
  return local.length === 11 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : phone;
}

/**
 * Phone numbers stay hidden until the money is secured (escrow funded for a job,
 * order paid for a delivery). Then both sides can call each other.
 */
export function ContactCard({ unlocked, name, phone, who, lockedNote }: { unlocked: boolean; name: string; phone: string; who: string; lockedNote?: string }) {
  const { c } = useTheme();
  const call = () => {
    const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
    if (Platform.OS === 'web') window.open(url, '_self');
    else Linking.openURL(url).catch(() => undefined);
  };
  return (
    <Card style={{ marginTop: space.md }}>
      <Row gap={space.sm} style={{ alignItems: 'center' }}>
        <Icon name={unlocked ? 'call' : 'lock-closed'} size={18} color={unlocked ? c.success : c.textMuted} />
        <Txt v="bodyStrong" style={{ flex: 1 }}>
          {who}: {name}
        </Txt>
      </Row>
      {unlocked ? (
        <>
          <Txt style={{ marginTop: 6, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 }}>{localPhone(phone)}</Txt>
          <Txt v="small" muted style={{ marginTop: 2 }}>
            Unlocked because payment is secured with Sleek. Keep payments inside the app.
          </Txt>
          <Button small title={`Call ${name.split(' ')[0]}`} icon="call-outline" onPress={call} style={{ marginTop: space.sm }} />
        </>
      ) : (
        <>
          <Txt style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: c.textMuted }}>{maskPhone(phone)}</Txt>
          <Txt v="small" muted style={{ marginTop: 2 }}>
            {lockedNote ?? 'The phone number unlocks as soon as payment is complete. Until then, chat in the app.'}
          </Txt>
        </>
      )}
    </Card>
  );
}
