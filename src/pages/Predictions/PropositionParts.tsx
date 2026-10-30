import { useState } from 'react';
import { Badge, Button, Group, Modal, Stack, Table, Text, Tooltip } from '@mantine/core';
import { RelationshipEvidence } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { evidenceRows, FLAG_DESCRIPTIONS, flagLabel } from '../../utils/propositions';

export function FlagBadges({ flags }: { flags: string[] | null | undefined }) {
  return (
    <>
      {(flags ?? []).map(f => (
        <Tooltip key={f} label={FLAG_DESCRIPTIONS[f] ?? f} multiline w={320} withArrow>
          <Badge color="pink" variant="light" size="xs" mr={4}>{flagLabel(f)}</Badge>
        </Tooltip>
      ))}
    </>
  );
}

export function EvidencePanel({ evidence, labelA = 'A', labelB = 'B' }: {
  evidence: RelationshipEvidence | null | undefined;
  labelA?: string;
  labelB?: string;
}) {
  if (!evidence) {
    return <Text size="sm" c="dimmed" p="sm">No evidence recorded (a manual relationship, or one written before derivation).</Text>;
  }
  return (
    <Stack gap={6} p="xs">
      <Text size="sm">
        Rule <Text span fw={600}>{evidence.rule}</Text>
        <Text span c="dimmed"> · derivation {evidence.version}</Text>
      </Text>
      <Table withColumnBorders fz="sm" style={{ maxWidth: 760 }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Field</Table.Th>
            <Table.Th>{labelA}</Table.Th>
            <Table.Th>{labelB}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {evidenceRows(evidence).map(row => (
            <Table.Tr key={row.field} bg={row.differs ? 'var(--mantine-color-yellow-light)' : undefined}>
              <Table.Td><Text size="sm" ff="monospace">{row.field}</Text></Table.Td>
              <Table.Td>{row.a}</Table.Td>
              <Table.Td>{row.b}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export interface SubjectRef {
  subjectId: number;
  key: string;
  propositionCount: number;
}

/** Confirms merging `from` into `into`. The registry merges into the end of `into`'s merge chain. */
export function MergeSubjectModal({ from, into, onClose, onMerged }: {
  from: SubjectRef | null;
  into: SubjectRef | null;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!from || !into) return;
    setPending(true);
    setError(null);
    try {
      await registryApi.mergeSubjects(from.subjectId, into.subjectId);
      onMerged();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Failed to merge subjects'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal opened={from !== null && into !== null} onClose={close} title="Merge subjects" size="md">
      {from && into && (
        <Stack>
          <Text size="sm">
            Merge <Text span fw={600} ff="monospace">{from.key}</Text> into{' '}
            <Text span fw={600} ff="monospace">{into.key}</Text>?
          </Text>
          <Text size="sm" c="dimmed">
            {from.propositionCount} proposition{from.propositionCount === 1 ? '' : 's'} move to {into.key}, and both
            subjects are re-derived, so relationships between their contracts appear within a minute or two. You can
            unmerge later.
          </Text>
          {error && <Text c="red" size="sm">{error}</Text>}
          <Group justify="flex-end">
            <Button variant="default" disabled={pending} onClick={close}>Cancel</Button>
            <Button loading={pending} onClick={confirm}>Merge</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
