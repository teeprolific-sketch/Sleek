import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { showMessage } from '../../components/domain';
import { Avatar, Banner, Button, Chip, Field, Row, Screen, Spacer, Stars, Txt } from '../../components/ui';
import { useJob, useStore } from '../../store';
import { space } from '../../theme';

const QUICK = ['On time', 'Neat work', 'Polite', 'Fair price', 'Explained clearly', 'Would book again'];

export default function RateJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);
  const artisan = useStore((s) => s.artisans.find((a) => a.id === job?.artisanId));
  const submitReview = useStore((s) => s.submitReview);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  if (!job || !artisan) return <Screen title="Rate">{<Txt>Not found.</Txt>}</Screen>;

  if (job.reviewId) {
    return (
      <Screen title="Thanks!">
        <Banner tone="success" body="Your review has been posted. It helps other customers choose good artisans." />
        <Spacer />
        <Button title="Back to my jobs" onPress={() => router.replace('/jobs')} />
      </Screen>
    );
  }
  const submit = () => {
    const text = [tags.join(', '), comment.trim()].filter(Boolean).join('. ');
    const r = submitReview(job.id, rating, text || 'Good job.');
    if (!r.ok) return showMessage('Could not post review', r.error);
    router.replace('/jobs');
  };
  return (
    <Screen title="Rate your artisan" footer={<Button title="Post review" disabled={!rating} onPress={submit} />}>
      <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
        <Avatar name={artisan.businessName ?? artisan.name} color={artisan.avatarColor} size={72} />
        <Txt v="h2" style={{ marginTop: space.md }}>
          {artisan.businessName ?? artisan.name}
        </Txt>
        <Txt muted>{job.title}</Txt>
        <View style={{ marginTop: space.lg }}>
          <Stars value={rating} size={36} onChange={setRating} />
        </View>
      </View>
      <Row wrap gap={8}>
        {QUICK.map((t) => (
          <Chip key={t} label={t} selected={tags.includes(t)} onPress={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} />
        ))}
      </Row>
      <Spacer h={space.lg} />
      <Field multiline label="Tell others about the job (optional)" value={comment} onChangeText={setComment} placeholder="What went well? Anything to improve?" />
      <Txt v="small" muted>
        Reviews can only be left for completed escrow jobs, so every review on Sleek is real.
      </Txt>
    </Screen>
  );
}
