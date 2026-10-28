import { useState } from 'react';
import { ActionIcon, Alert, Badge, Group, Menu, Table, Text, Tooltip } from '@mantine/core';
import { ReasonConfirmModal } from '../../../components/ReasonConfirmModal';
import { IconDots } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCollectionRules } from '../../../query/hooks';
import { CollectionRule } from '../../../types/collection';
import { collectionApi } from '../../../utils/api';
import { RULE_TYPE_LABELS, ruleCriteria, ruleSelection, ruleStreamCount } from '../../../utils/collection';
import { errorMessage } from '../../../utils/kill-switch';
import { SkeletonRows } from '../../../components/SkeletonRows';

// The rules that say what to collect. A change wakes the reconciler at once.
export function RulesTable({ onEdit }: { onEdit: (rule: CollectionRule) => void }) {
  const queryClient = useQueryClient();
  const rules = useCollectionRules();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ rule: CollectionRule; action: 'delete' | 'pause' } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['collection'] });
  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      refresh();
    } catch (e) {
      setError(errorMessage(e, 'The change failed'));
    }
  };

  return (
    <>
      {(rules.error || error) && <Alert color="red" mb="md">{error ?? rules.error?.message}</Alert>}
      <Table striped withTableBorder verticalSpacing={6} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Selects</Table.Th>
            <Table.Th>Priority</Table.Th>
            <Table.Th>Tier</Table.Th>
            <Table.Th>Grace</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>By</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(rules.data ?? []).map((r) => (
            <Table.Tr key={r.ruleId}>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={600}>{r.name}</Text>
                  {r.managedBy && (
                    <Tooltip label="Another system owns what this rule selects">
                      <Badge size="xs" variant="outline" color="gray">{r.managedBy}</Badge>
                    </Tooltip>
                  )}
                </Group>
              </Table.Td>
              <Table.Td>{RULE_TYPE_LABELS[r.ruleType] ?? r.ruleType}</Table.Td>
              <Table.Td>
                <Text size="sm">{ruleSelection(r)}</Text>
                {ruleCriteria(r) && <Text size="xs" c="dimmed">{ruleCriteria(r)}</Text>}
              </Table.Td>
              <Table.Td>{r.priority.toLowerCase()}</Table.Td>
              <Table.Td>{r.tier}</Table.Td>
              <Table.Td>{r.retireGraceMinutes != null ? `${r.retireGraceMinutes} min` : <Text span size="sm" c="dimmed">default</Text>}</Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light" color={r.status === 'ACTIVE' ? 'teal' : 'gray'}>{r.status.toLowerCase()}</Badge>
              </Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{r.updatedBy ?? r.createdBy ?? '—'}</Text></Table.Td>
              <Table.Td>
                <Group justify="flex-end">
                  <Menu position="bottom-end">
                    <Menu.Target><ActionIcon variant="subtle" aria-label="Rule actions"><IconDots size={16} /></ActionIcon></Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={() => onEdit(r)}>Edit</Menu.Item>
                      {r.status === 'ACTIVE'
                        ? <Menu.Item onClick={() => setConfirming({ rule: r, action: 'pause' })}>Pause</Menu.Item>
                        : <Menu.Item onClick={() => act(() => collectionApi.updateRule(r.ruleId, { status: 'ACTIVE' }))}>Resume</Menu.Item>}
                      <Menu.Item color="red" onClick={() => setConfirming({ rule: r, action: 'delete' })}>Delete</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {rules.isLoading && <SkeletonRows cols={9} />}
          {rules.data?.length === 0 && (
            <Table.Tr><Table.Td colSpan={9}><Text size="sm" c="dimmed">No rules yet.</Text></Table.Td></Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <ReasonConfirmModal
        opened={confirming != null}
        onClose={() => setConfirming(null)}
        title={confirming ? `${confirming.action === 'delete' ? 'Delete' : 'Pause'} ${confirming.rule.name}` : ''}
        message={confirming?.action === 'delete'
          ? `${streamsOf(confirming.rule)} retire after their grace unless another rule wants them; a shard left empty for 10 minutes is deleted.`
          : `${confirming ? streamsOf(confirming.rule) : ''} retire after their grace, as if it were deleted, until it is resumed.`}
        confirmLabel={confirming?.action === 'delete' ? 'Delete' : 'Pause'}
        confirmColor={confirming?.action === 'delete' ? 'red' : 'orange'}
        askReason={false}
        onConfirm={async () => {
          if (!confirming) return;
          if (confirming.action === 'delete') await collectionApi.deleteRule(confirming.rule.ruleId);
          else await collectionApi.updateRule(confirming.rule.ruleId, { status: 'PAUSED' });
          refresh();
        }}
      />
    </>
  );
}

function streamsOf(rule: CollectionRule): string {
  const count = ruleStreamCount(rule);
  return count == null ? 'Its streams' : `Its ${count} streams`;
}
