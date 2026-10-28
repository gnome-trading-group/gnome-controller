import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Stack, Textarea, TextInput } from '@mantine/core';
import { CollectionRule, Priority } from '../../../types/collection';
import { collectionApi } from '../../../utils/api';
import { parseStreamIds } from '../../../utils/collection';
import { errorMessage } from '../../../utils/kill-switch';

// Creates a static_streams rule, or changes one's name, streams and grace. Saving wakes the reconciler, which places
// new streams within its tick and retires dropped ones after their grace.
export function RuleModal({ rule, opened, onClose, onSaved }: {
  rule: CollectionRule | null;
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [streams, setStreams] = useState('');
  const [priority, setPriority] = useState<Priority>('RESEARCH');
  const [tier, setTier] = useState('standard');
  const [grace, setGrace] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(rule?.name ?? '');
    setStreams(rule ? rule.parameters.streamIds.join(', ') : '');
    setPriority(rule?.priority ?? 'RESEARCH');
    setTier(rule?.tier ?? 'standard');
    setGrace(rule?.retireGraceMinutes ?? '');
    setError(null);
  }, [rule, opened]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const streamIds = parseStreamIds(streams);
      if (streamIds.length === 0) throw new Error('A rule needs at least one stream');
      const graceMinutes = grace === '' ? undefined : grace;
      if (rule) {
        await collectionApi.updateRule(rule.ruleId, { name, stream_ids: streamIds, retire_grace_minutes: graceMinutes });
      } else {
        await collectionApi.createRule({ name, stream_ids: streamIds, priority, tier, retire_grace_minutes: graceMinutes });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Saving the rule failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={() => !saving && onClose()} title={rule ? `Edit ${rule.name}` : 'New collection rule'}>
      <Stack>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Textarea label="Stream ids" autosize minRows={3} maxRows={10} value={streams}
          description="Separated by commas, spaces or lines." onChange={(e) => setStreams(e.currentTarget.value)} />
        {!rule && (
          <>
            <SegmentedControl value={priority} onChange={(v) => setPriority(v as Priority)}
              data={[{ label: 'Research (Spot)', value: 'RESEARCH' }, { label: 'Production (on demand)', value: 'PRODUCTION' }]} />
            <TextInput label="Tier" value={tier} onChange={(e) => setTier(e.currentTarget.value)}
              description="Streams of different tiers never share a shard." />
          </>
        )}
        <NumberInput label="Retire grace (minutes)" min={0} allowDecimal={false} value={grace}
          description="How long a stream no rule wants keeps collecting. Leave empty for the default."
          onChange={(v) => setGrace(typeof v === 'number' ? v : '')} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>{rule ? 'Save' : 'Create'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
