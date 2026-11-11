import { useMemo, useState } from 'react';
import {
  Alert,
  Anchor,
  Autocomplete,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { ContractProposition, SubjectKeyAlias, SubjectKeyAliasKind, SubjectKeyAliasOrigin, SubjectMergeLogEntry } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { keyUsage, possibleSplits, SplitReason } from '../../utils/subjectKeys';

const ORIGIN_COLORS: Record<SubjectKeyAliasOrigin, string> = {
  MERGE: 'blue',
  RECONCILE: 'grape',
  MANUAL: 'gray',
};

const SPLIT_REASONS: Record<SplitReason, string> = {
  VENUES_DISAGREE: 'two venues each use a key the other does not',
  SAME_OPPONENT: 'two keys each face the same opponent but never share an event',
};

export function AliasText({ alias }: { alias: Pick<SubjectKeyAlias, 'key' | 'canonicalKey'> }) {
  return <Text span size="sm" ff="monospace">{alias.key} → {alias.canonicalKey}</Text>;
}

interface Props {
  subjectId: number;
  propositions: ContractProposition[];
  aliases: SubjectKeyAlias[];
  history: SubjectMergeLogEntry[];
  onChanged: () => void;
}

/** A subject's key aliases, the keys its contracts use and what each derives as, and the keys that look like one
 * entity split; a person can add or remove aliases (stored as MANUAL). */
function SubjectKeys({ subjectId, propositions, aliases, history, onChanged }: Props) {
  const uses = useMemo(() => keyUsage(propositions, aliases), [propositions, aliases]);
  const splits = useMemo(() => possibleSplits(propositions, aliases), [propositions, aliases]);
  const merges = useMemo(() => new Map(history.map(h => [h.mergeLogId, h])), [history]);
  const [kind, setKind] = useState<SubjectKeyAliasKind>('ENTITY');
  const [key, setKey] = useState('');
  const [canonicalKey, setCanonicalKey] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SubjectKeyAlias | null>(null);

  const keyOptions = useMemo(() => [...new Set(uses.flatMap(u => [u.key, u.effective]))].sort(), [uses]);

  const change = async (body: Parameters<typeof registryApi.changeSubjectKeyAliases>[1]) => {
    setPending(true);
    setError(null);
    try {
      await registryApi.changeSubjectKeyAliases(subjectId, body);
      setKey('');
      setCanonicalKey('');
      setReason('');
      setRemoving(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e, 'Failed to change key aliases'));
    } finally {
      setPending(false);
    }
  };

  const add = () => change({ set: [{
    kind, key: key.trim(), canonicalKey: canonicalKey.trim(), origin: 'MANUAL', reason: reason.trim() || undefined,
  }] });

  return (
    <Stack gap="xs">
      <Title order={4}>Keys</Title>
      <Text size="sm" c="dimmed">
        Contracts relate only where their keys match, so one team keyed two ways (<Text span ff="monospace" size="sm">rgg</Text>{' '}
        and <Text span ff="monospace" size="sm">roundsgg</Text>) relates nothing. Aliases join them: derivation reads the
        left key as the right one, across this subject and every subject merged into it. Any change re-derives the subject.
      </Text>

      {splits.length > 0 && (
        <Alert color="yellow" title="Possible split keys">
          <Stack gap={4}>
            {splits.map(s => (
              <Text key={s.slot} size="sm">
                <Text span ff="monospace" size="sm">{s.slot}</Text>: {s.reasons.map(r => SPLIT_REASONS[r]).join('; ')}:{' '}
                {s.keys.map((k, i) => (
                  <span key={k.key}>
                    {i > 0 && ', '}
                    <Tooltip label="Use as the alias's key">
                      <Anchor component="button" type="button" size="sm" ff="monospace" onClick={() => setKey(k.key)}>
                        {k.key}
                      </Anchor>
                    </Tooltip>
                    <Text span size="xs" c="dimmed"> ({k.venues.join(', ')})</Text>
                  </span>
                ))}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      <Paper withBorder>
        <Table striped withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Alias</Table.Th>
              <Table.Th style={{ width: 90 }}>Kind</Table.Th>
              <Table.Th style={{ width: 110 }}>Origin</Table.Th>
              <Table.Th>Why</Table.Th>
              <Table.Th style={{ width: 200 }}>By</Table.Th>
              <Table.Th style={{ width: 150 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {aliases.length === 0 && (
              <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">No aliases.</Text></Table.Td></Table.Tr>
            )}
            {aliases.map(a => {
              const merge = a.mergeLogId === null ? undefined : merges.get(a.mergeLogId);
              return (
                <Table.Tr key={`${a.subjectId}-${a.kind}-${a.key}`}>
                  <Table.Td>
                    <AliasText alias={a} />
                    {a.flags.map(f => <Badge key={f} size="xs" color="orange" variant="light" ml={6}>{f}</Badge>)}
                  </Table.Td>
                  <Table.Td>{a.kind.toLowerCase()}</Table.Td>
                  <Table.Td><OriginBadge origin={a.origin} /></Table.Td>
                  <Table.Td>
                    {a.mergeLogId !== null && (
                      <Text size="xs" c="dimmed">
                        merge #{a.mergeLogId}
                        {merge && <>: <Text span ff="monospace" size="xs">{merge.aliasKey}</Text> into{' '}
                          <Text span ff="monospace" size="xs">{merge.canonicalKey}</Text></>}
                      </Text>
                    )}
                    <Text size="xs">{a.reason || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{a.actor}</Text>
                    <Text size="xs" c="dimmed"><ReactTimeAgo date={new Date(a.dateModified)} timeStyle="round" /></Text>
                  </Table.Td>
                  <Table.Td>
                    {removing === a ? (
                      <Group gap={4} wrap="nowrap">
                        <Button size="compact-xs" color="red" loading={pending}
                          onClick={() => change({ remove: [{ kind: a.kind, key: a.key }] })}>
                          Remove
                        </Button>
                        <Button size="compact-xs" variant="default" disabled={pending} onClick={() => setRemoving(null)}>
                          Keep
                        </Button>
                      </Group>
                    ) : (
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => setRemoving(a)}>Remove…</Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
      {removing?.origin === 'MERGE' && (
        <Text size="xs" c="dimmed">
          {removing.key} → {removing.canonicalKey} came with merge #{removing.mergeLogId}; unmerging would remove it too.
        </Text>
      )}

      <Group align="flex-end" gap="xs" wrap="wrap">
        <SegmentedControl size="xs" value={kind} onChange={v => setKind(v as SubjectKeyAliasKind)}
          data={[{ value: 'ENTITY', label: 'Entity' }, { value: 'MEASURE', label: 'Measure' }]} />
        <Autocomplete size="xs" label="Key" placeholder="roundsgg" value={key} onChange={setKey}
          data={kind === 'ENTITY' ? keyOptions : []} w={180} />
        <Text size="sm" pb={6}>reads as</Text>
        <Autocomplete size="xs" label="Canonical key" placeholder="rgg" value={canonicalKey} onChange={setCanonicalKey}
          data={kind === 'ENTITY' ? keyOptions : []} w={180} />
        <TextInput size="xs" label="Reason" placeholder="Same team" value={reason} onChange={e => setReason(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 200 }} />
        <Button size="xs" loading={pending} disabled={!key.trim() || !canonicalKey.trim() || key.trim() === canonicalKey.trim()}
          onClick={add}>
          Add alias
        </Button>
      </Group>
      {error && <Text c="red" size="sm">{error}</Text>}

      <Paper withBorder>
        <Table striped withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Key</Table.Th>
              <Table.Th>Derives as</Table.Th>
              <Table.Th>Venues</Table.Th>
              <Table.Th style={{ width: 110 }}>Open contracts</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {uses.length === 0 && (
              <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">No open contract names an entity.</Text></Table.Td></Table.Tr>
            )}
            {uses.map(u => (
              <Table.Tr key={u.key}>
                <Table.Td><Text size="sm" ff="monospace">{u.key}</Text></Table.Td>
                <Table.Td>
                  <Text size="sm" ff="monospace" c={u.effective === u.key ? 'dimmed' : undefined}>{u.effective}</Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>{u.venues.map(v => <Badge key={v} size="xs" variant="outline">{v}</Badge>)}</Group>
                </Table.Td>
                <Table.Td>{u.contracts}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}

export default SubjectKeys;

export function OriginBadge({ origin }: { origin: SubjectKeyAliasOrigin }) {
  return <Badge size="sm" variant="light" color={ORIGIN_COLORS[origin]}>{origin.toLowerCase()}</Badge>;
}

export function SubjectAnchor({ id, subjectKey }: { id: number; subjectKey: string }) {
  return <Anchor component={Link} to={`/predictions/subjects/${id}`} size="sm" ff="monospace">{subjectKey}</Anchor>;
}
