import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Group, Loader, Modal, NumberInput, Paper, SegmentedControl, Stack, Table, Text, Textarea, TextInput,
} from '@mantine/core';
import { SchemaFormFields } from '../../../components/SchemaFormFields';
import { useCollectionRuleTypes } from '../../../query/hooks';
import { CollectionRule, CollectionRuleType, Priority, RuleParameters, RulePreview } from '../../../types/collection';
import { collectionApi } from '../../../utils/api';
import { ID_LIST_PARAMETERS, parseStreamIds, RULE_TYPE_LABELS } from '../../../utils/collection';
import { formatVolume } from '../../../utils/format';
import { errorMessage } from '../../../utils/kill-switch';

const TYPE_ORDER: CollectionRuleType[] = ['static_streams', 'event', 'event_filter'];

// Creates a rule of any type, or changes one's name, parameters and grace (its type, priority and tier are fixed once
// created). A rule another system manages shows what it selects but only that system changes it. Saving wakes the
// reconciler, which places new streams within its tick and retires dropped ones after their grace.
export function RuleModal({ rule, opened, onClose, onSaved }: {
  rule: CollectionRule | null;
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ruleTypes = useCollectionRuleTypes();
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState<CollectionRuleType>('static_streams');
  const [values, setValues] = useState<RuleParameters>({});
  // Id lists are edited as pasted text: hundreds of ids at once.
  const [idText, setIdText] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<Priority>('RESEARCH');
  const [tier, setTier] = useState('standard');
  const [grace, setGrace] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const parameters = rule?.parameters ?? {};
    setName(rule?.name ?? '');
    setRuleType(rule?.ruleType ?? 'static_streams');
    setValues(Object.fromEntries(Object.entries(parameters).filter(([k]) => !ID_LIST_PARAMETERS.has(k))));
    setIdText(Object.fromEntries(Object.entries(parameters)
      .filter(([k]) => ID_LIST_PARAMETERS.has(k))
      .map(([k, ids]) => [k, (ids as number[]).join(', ')])));
    setPriority(rule?.priority ?? 'RESEARCH');
    setTier(rule?.tier ?? 'standard');
    setGrace(rule?.retireGraceMinutes ?? '');
    setError(null);
    setPreview(null);
  }, [rule, opened]);

  const schema = ruleTypes.data?.[ruleType];
  const properties = useMemo(() => schema?.properties ?? {}, [schema]);
  const idKeys = Object.keys(properties).filter(k => ID_LIST_PARAMETERS.has(k));
  const otherProperties = Object.fromEntries(Object.entries(properties).filter(([k]) => !ID_LIST_PARAMETERS.has(k)));
  const managed = rule?.managedBy != null;

  const changeType = (type: CollectionRuleType) => {
    setRuleType(type);
    setValues({});
    setIdText({});
    setPreview(null);
  };

  // The form as the rule's parameters, with each schema default the user left alone.
  const parameters = (): RuleParameters => {
    const result: RuleParameters = {};
    for (const [key, prop] of Object.entries(properties)) {
      if (ID_LIST_PARAMETERS.has(key)) {
        const ids = parseStreamIds(idText[key] ?? '');
        if (ids.length) result[key] = ids;
      } else if (values[key] !== undefined) {
        result[key] = values[key];
      } else if (prop.default !== undefined && prop.default !== null) {
        result[key] = prop.default;
      }
    }
    return result;
  };

  const runPreview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await collectionApi.previewRule(ruleType, parameters()));
    } catch (e) {
      setError(errorMessage(e, 'The preview failed'));
    } finally {
      setPreviewing(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const graceMinutes = grace === '' ? undefined : grace;
      if (rule) {
        await collectionApi.updateRule(rule.ruleId, {
          name, retire_grace_minutes: graceMinutes, ...(managed ? {} : { parameters: parameters() }),
        });
      } else {
        await collectionApi.createRule({
          name, rule_type: ruleType, parameters: parameters(), priority, tier, retire_grace_minutes: graceMinutes,
        });
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
    <Modal opened={opened} onClose={() => !saving && onClose()} size="lg"
      title={rule ? `Edit ${rule.name}` : 'New collection rule'}>
      <Stack>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        {!rule && (
          <SegmentedControl value={ruleType} onChange={(v) => changeType(v as CollectionRuleType)}
            data={TYPE_ORDER.map(t => ({ label: RULE_TYPE_LABELS[t], value: t }))} />
        )}
        {ruleTypes.isLoading && <Loader size="sm" />}
        {ruleTypes.error && <Alert color="red">Couldn't load the rule types: {ruleTypes.error.message}</Alert>}
        {schema && <Text size="sm" c="dimmed">{schema.description}</Text>}
        {managed && (
          <Alert color="blue">
            Managed by <b>{rule?.managedBy}</b>: what it selects changes there. You can rename, pause or delete it.
          </Alert>
        )}
        <fieldset disabled={managed} style={{ border: 0, padding: 0, margin: 0 }}>
          <Stack>
            {idKeys.map(key => (
              <Textarea key={key} label={key === 'event_ids' ? 'Event ids' : 'Stream ids'} autosize minRows={3}
                maxRows={10} required={schema?.required?.includes(key)} value={idText[key] ?? ''}
                description="Separated by commas, spaces or lines."
                onChange={(e) => {
                  const text = e.currentTarget.value;
                  setIdText(current => ({ ...current, [key]: text }));
                }} />
            ))}
            <SchemaFormFields properties={otherProperties} required={schema?.required ?? []} values={values}
              onChange={(key, value) => setValues(current => ({ ...current, [key]: value }))} />
          </Stack>
        </fieldset>
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
        {preview && <PreviewResult preview={preview} />}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="space-between">
          <Button variant="light" onClick={runPreview} loading={previewing} disabled={!schema || saving}>
            Preview
          </Button>
          <Group>
            <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!schema}>{rule ? 'Save' : 'Create'}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

// What the rule would collect if saved now, as the reconciler would select it.
function PreviewResult({ preview }: { preview: RulePreview }) {
  return (
    <Paper withBorder p="sm">
      <Text size="sm" fw={600} mb={preview.sample.length ? 'xs' : 0}>
        {preview.events > 0 && `${preview.events} events · `}{preview.streams} streams
        {preview.capped && <Text span size="sm" c="orange"> · capped by max streams</Text>}
      </Text>
      {preview.sample.length > 0 && (
        <Table fz="xs" verticalSpacing={2}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Event</Table.Th>
              <Table.Th ta="right">24h volume</Table.Th>
              <Table.Th ta="right">Streams</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {preview.sample.map(e => (
              <Table.Tr key={e.eventId}>
                <Table.Td>{e.title}</Table.Td>
                <Table.Td ta="right">{formatVolume(e.volume24h)}</Table.Td>
                <Table.Td ta="right">{e.streams}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {preview.events > preview.sample.length && (
        <Text size="xs" c="dimmed" mt={4}>And {preview.events - preview.sample.length} more.</Text>
      )}
    </Paper>
  );
}
