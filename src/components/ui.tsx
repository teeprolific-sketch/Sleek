import { Ionicons } from '@expo/vector-icons';
import { router, useCanGoBack } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StatusTone } from '../domain/escrow';
import { NetworkBanner } from './feedback';
import { font, radius, space, useTheme, type Palette } from '../theme';
import { initials } from '../utils/format';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color, style }: { name: string; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Ionicons name={name as IconName} size={size} color={color ?? c.text} style={style} />;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type Variant = keyof typeof font;
export function Txt({
  v = 'body',
  muted,
  color,
  center,
  style,
  children,
  numberOfLines,
}: {
  v?: Variant;
  muted?: boolean;
  color?: string;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
}) {
  const { c } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[font[v], { color: color ?? (muted ? c.textMuted : c.text) }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  title,
  back = true,
  right,
  scroll = true,
  children,
  padded = true,
  footer,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { c } = useTheme();
  const canGoBack = useCanGoBack();
  const body = scroll ? (
    <ScrollView contentContainerStyle={[padded && { padding: space.lg }, { paddingBottom: space.xxl * 2 }]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: space.lg }]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      {title !== undefined && (
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          {back && canGoBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
              <Icon name="chevron-back" size={24} />
            </Pressable>
          ) : (
            <View style={{ width: 4 }} />
          )}
          <View style={{ flex: 1 }}>
            <Txt v="h3" numberOfLines={1}>
              {title}
            </Txt>
            {subtitle ? (
              <Txt v="small" muted numberOfLines={1}>
                {subtitle}
              </Txt>
            ) : null}
          </View>
          {right}
        </View>
      )}
      <NetworkBanner />
      <View style={{ flex: 1 }}>{body}</View>
      {footer ? <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.bg }]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Row({ children, gap = space.sm, style, wrap }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Spacer({ h = space.md }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function Card({ children, style, onPress, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: 'soft' }) {
  const { c } = useTheme();
  const base = [styles.card, { backgroundColor: tone === 'soft' ? c.surfaceAlt : c.card, borderColor: c.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Section({ title, action, onAction, children, style }: { title: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ marginTop: space.xl }, style]}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <Txt v="h3">{title}</Txt>
        {action ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Txt v="bodyStrong" color={c.primary}>
              {action}
            </Txt>
          </Pressable>
        ) : null}
      </Row>
      {children}
    </View>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: space.md }} />;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'deep' | 'hero';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
  style,
  full = true,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const { c } = useTheme();
  const bg = { primary: c.primary, secondary: c.primarySoft, ghost: 'transparent', danger: c.danger, deep: c.heroBg, hero: c.heroAccent }[variant];
  const fg = { primary: c.primaryText, secondary: c.primaryStrong, ghost: c.primaryStrong, danger: '#FFFFFF', deep: c.heroText, hero: c.heroAccentText }[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1, alignSelf: full ? 'stretch' : 'flex-start' },
        variant === 'ghost' && { borderWidth: 1, borderColor: c.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={[small ? font.small : font.bodyStrong, { color: fg, fontWeight: '700' }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, badge }: { icon: string; onPress: () => void; label: string; badge?: number }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={[styles.iconBtn, { backgroundColor: c.surface }]}>
      <Icon name={icon} size={20} />
      {badge ? (
        <View style={[styles.dot, { backgroundColor: c.danger }]}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? (
        <Txt v="small" style={{ fontWeight: '600', marginBottom: 6 }}>
          {label}
        </Txt>
      ) : null}
      <TextInput
        placeholderTextColor={c.textMuted}
        {...props}
        style={[
          styles.input,
          { borderColor: error ? c.danger : c.border, color: c.text, backgroundColor: c.surface },
          props.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
          style,
        ]}
      />
      {error ? (
        <Txt v="small" color={c.danger} style={{ marginTop: 4 }}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt v="small" muted style={{ marginTop: 4 }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? c.primary : c.surface, borderColor: selected ? c.primary : c.border }]}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? c.primaryText : c.text} /> : null}
      <Text style={[font.small, { color: selected ? c.primaryText : c.text, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: c.surface, borderColor: c.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: c.card, shadowOpacity: 0.08 }]}
          >
            <Text style={[font.small, { fontWeight: '700', color: active ? c.primary : c.textMuted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.toggle, { backgroundColor: value ? c.primary : c.border }]}
    >
      <View style={[styles.knob, { backgroundColor: value ? c.primaryText : '#FFFFFF', transform: [{ translateX: value ? 20 : 0 }] }]} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function toneColors(c: Palette, tone: StatusTone | 'success' | 'danger') {
  return {
    info: { bg: c.infoSoft, fg: c.info },
    primary: { bg: c.primarySoft, fg: c.primaryStrong },
    success: { bg: c.successSoft, fg: c.success },
    warning: { bg: c.warningSoft, fg: c.warning },
    danger: { bg: c.dangerSoft, fg: c.danger },
    neutral: { bg: c.neutralSoft, fg: c.textMuted },
  }[tone];
}

export function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: StatusTone; icon?: string }) {
  const { c } = useTheme();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      <Text style={[font.tiny, { color: t.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function Banner({ tone = 'info', icon, title, body, action, onAction }: { tone?: StatusTone; icon?: string; title?: string; body: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Icon name={icon ?? (tone === 'danger' ? 'warning-outline' : tone === 'success' ? 'checkmark-circle' : 'information-circle-outline')} size={20} color={t.fg} />
      <View style={{ flex: 1 }}>
        {title ? (
          <Txt v="bodyStrong" color={t.fg}>
            {title}
          </Txt>
        ) : null}
        <Txt v="small" color={c.text}>
          {body}
        </Txt>
        {action ? (
          <Pressable onPress={onAction} style={{ marginTop: 6 }}>
            <Txt v="small" color={t.fg} style={{ fontWeight: '700' }}>
              {action} →
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Avatar({ name, color, size = 44 }: { name: string; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? '#0EA5E9', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  const { c } = useTheme();
  return (
    <Row gap={onChange ? 8 : 1}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name = value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline';
        const star = <Icon key={i} name={name} size={size} color={c.star} />;
        return onChange ? (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`} onPress={() => onChange(i)} hitSlop={6}>
            {star}
          </Pressable>
        ) : (
          star
        );
      })}
    </Row>
  );
}

export function ListItem({
  icon,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={({ pressed }) => [styles.listItem, { borderBottomColor: c.border }, pressed && onPress && { opacity: 0.7 }]}>
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: danger ? c.dangerSoft : c.primarySoft }]}>
          <Icon name={icon} size={18} color={danger ? c.danger : c.primaryStrong} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt v="bodyStrong" color={danger ? c.danger : undefined}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt v="small" muted>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={c.textMuted} /> : null)}
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, action, onAction }: { icon: string; title: string; body: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg }}>
      <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}>
        <Icon name={icon} size={34} color={c.primary} />
      </View>
      <Txt v="h3" center style={{ marginTop: space.lg }}>
        {title}
      </Txt>
      <Txt muted center style={{ marginTop: space.xs, maxWidth: 300 }}>
        {body}
      </Txt>
      {action ? (
        <View style={{ marginTop: space.lg, minWidth: 200 }}>
          <Button title={action} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  const { c } = useTheme();
  return (
    <View>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Row key={s} style={{ alignItems: 'flex-start' }} gap={space.md}>
            <View style={{ alignItems: 'center' }}>
              <View style={[styles.stepDot, { backgroundColor: done ? c.success : active ? c.primary : c.border }]}>
                {done ? <Icon name="checkmark" size={12} color="#fff" /> : <Text style={{ color: active ? c.primaryText : '#fff', fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>}
              </View>
              {i < steps.length - 1 ? <View style={{ width: 2, height: 22, backgroundColor: done ? c.success : c.border }} /> : null}
            </View>
            <Txt v={active ? 'bodyStrong' : 'body'} muted={!done && !active} style={{ marginTop: 1 }}>
              {s}
            </Txt>
          </Row>
        );
      })}
    </View>
  );
}

export function Stat({ label, value, icon }: { label: string; value: string; icon?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      {icon ? <Icon name={icon} size={18} color={c.primary} /> : null}
      <Txt v="h2" style={{ marginTop: 4 }}>
        {value}
      </Txt>
      <Txt v="small" muted>
        {label}
      </Txt>
    </View>
  );
}

export function KeyValue({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
      <Txt muted>{k}</Txt>
      <Txt v={strong ? 'bodyStrong' : 'body'} style={{ flexShrink: 1, textAlign: 'right' }}>
        {v}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { padding: 4 },
  footer: { padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth, gap: space.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg },
  btn: { minHeight: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  btnSmall: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 50, fontSize: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  segment: { flexDirection: 'row', borderRadius: radius.md, borderWidth: 1, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  banner: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, alignItems: 'flex-start' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, borderRadius: radius.md, borderWidth: 1, padding: space.md },
});
