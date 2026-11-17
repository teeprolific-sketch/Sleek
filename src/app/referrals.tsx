import React, { useMemo } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';
import { showMessage } from '../components/domain';
import { Banner, Button, Card, EmptyState, Icon, KeyValue, Pill, Row, Screen, Section, Stat, Steps, Txt } from '../components/ui';
import { makeReferralCode, QUALIFY_AFTER_JOBS, REFERRAL_REWARD } from '../domain/referrals';
import { useCurrentUser, useStore } from '../store';
import { radius, space, useTheme } from '../theme';
import { day, naira } from '../utils/format';

export default function Referrals() {
  const { c } = useTheme();
  const user = useCurrentUser();
  const all = useStore((s) => s.referrals);
  const mine = useMemo(() => all.filter((r) => r.referrerId === user?.id), [all, user?.id]);
  if (!user || user.role === 'admin') return null;
  const code = makeReferralCode(user.name, user.id);
  const earned = mine.filter((r) => r.status === 'qualified').reduce((s, r) => s + r.reward, 0);
  const pending = mine.filter((r) => r.status === 'pending').reduce((s, r) => s + r.reward, 0);
  const message = `Join me on Sleek — verified artisans, and your money stays in escrow until the job is done. Use my code ${code} when you sign up: https://sleek.ng/r/${code}`;

  const share = async () => {
    try {
      await Share.share({ message });
    } catch {
      showMessage('Share your code', message);
    }
  };
  const copy = async () => {
    try {
      if (Platform.OS === 'web') await (globalThis.navigator as Navigator | undefined)?.clipboard?.writeText(code);
      showMessage('Code', Platform.OS === 'web' ? `Copied ${code}` : code);
    } catch {
      showMessage('Your code', code);
    }
  };

  return (
    <Screen title="Refer & earn">
      <Card style={{ backgroundColor: c.heroBg, borderColor: c.heroBg }}>
        <Icon name="gift-outline" size={30} color={c.heroAccent} />
        <Txt v="h2" color={c.heroText} style={{ marginTop: 6 }}>
          Invite friends to Sleek
        </Txt>
        <Txt v="small" color={c.heroMuted}>
          Earn {naira(REFERRAL_REWARD.customer)} for each customer and {naira(REFERRAL_REWARD.artisan)} for each artisan you bring{user.role === 'customer' ? ' (as Sleek credit)' : ' (added to your earnings)'}.
        </Txt>
        <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={`Copy code ${code}`} style={{ marginTop: space.md, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.heroMuted, padding: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt v="h1" color={c.heroText} style={{ letterSpacing: 3 }}>
            {code}
          </Txt>
          <Icon name="copy-outline" color={c.heroText} />
        </Pressable>
        <Button variant="hero" title="Share invite" icon="share-social-outline" style={{ marginTop: space.md }} onPress={share} />
      </Card>

      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Stat label="Earned" value={naira(earned)} icon="checkmark-done-outline" />
        <Stat label="On the way" value={naira(pending)} icon="hourglass-outline" />
        <Stat label="Invited" value={String(mine.length)} icon="people-outline" />
      </Row>
      {user.role === 'customer' && (user.credit ?? 0) > 0 ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="success" icon="wallet-outline" body={`You have ${naira(user.credit ?? 0)} Sleek credit to use in Sleek Services.`} />
        </View>
      ) : null}

      <Section title="How it works">
        <Steps current={-1} steps={['Share your code', 'They sign up and enter it', `A customer completes ${QUALIFY_AFTER_JOBS.customer} escrow job, or an artisan completes ${QUALIFY_AFTER_JOBS.artisan}`, 'You both get rewarded']} />
        <Txt v="small" muted style={{ marginTop: space.sm }}>
          Rewards only count for real, completed escrow jobs — so fake accounts never earn anything.
        </Txt>
      </Section>

      <Section title="Your invites">
        {mine.length ? (
          mine.map((r) => (
            <Card key={r.id} style={{ marginBottom: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View>
                  <Txt v="bodyStrong">{r.refereeName}</Txt>
                  <Txt v="small" muted>
                    {r.refereeRole === 'artisan' ? 'Artisan' : 'Customer'} · joined {day(r.at)}
                  </Txt>
                </View>
                <Pill label={r.status === 'qualified' ? `+${naira(r.reward)}` : 'Pending'} tone={r.status === 'qualified' ? 'success' : 'warning'} />
              </Row>
              {r.status === 'pending' ? <KeyValue k="Needs" v={`${QUALIFY_AFTER_JOBS[r.refereeRole]} completed escrow job(s)`} /> : null}
            </Card>
          ))
        ) : (
          <EmptyState icon="people-outline" title="No invites yet" body="Share your code with friends, family, and artisans you trust." />
        )}
      </Section>
      <Txt v="tiny" muted style={{ marginTop: space.md, color: c.textMuted }}>
        SLEEK MAY CHANGE OR END THE PROGRAMME. ABUSE (FAKE ACCOUNTS, SELF-REFERRALS) VOIDS REWARDS.
      </Txt>
    </Screen>
  );
}
