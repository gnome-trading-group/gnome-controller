import { useState } from 'react';
import { Anchor, Badge, Button, Group, Stack, Table, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import ReactTimeAgo from 'react-time-ago';
import { PipelinesSection, PipelineRow, WaitingApproval } from '../../types';
import { controllerApi } from '../../utils/api';
import { ApprovalDialog, ApprovalTarget } from './ApprovalDialog';
import { useSystemHealth } from '../../query/hooks';
import { formatSeconds } from '../../utils/system';
import { SectionCard } from './SectionCard';

const STATUS_COLORS: Record<string, string> = {
  Succeeded: 'teal', InProgress: 'blue', Failed: 'red', Stopped: 'gray', Superseded: 'gray', Stopping: 'gray',
};

// Every deploy pipeline: how its latest run went, and approvals waiting on someone.
function Waiting({ pipeline, approval, canApprove, onDecide }: {
  pipeline: PipelineRow; approval: WaitingApproval; canApprove: boolean;
  onDecide: (target: ApprovalTarget) => void;
}) {
  return (
    <Stack gap={4} mt={4}>
      <Group gap="xs">
        <Text size="xs" c="orange" fw={600}>{approval.action} waiting {formatSeconds(approval.waitingSeconds)}</Text>
        <Badge size="xs" variant="light" color={approval.earlierStagesPassed ? 'teal' : 'orange'}>
          {approval.earlierStagesPassed ? 'passed earlier stages' : 'earlier stages not passed'}
        </Badge>
      </Group>
      {approval.revisions.map(r => (
        <Text key={`${r.source}/${r.revision}`} size="xs" c="dimmed" lineClamp={1}>
          {r.url
            ? <Anchor href={r.url} target="_blank" size="xs" ff="monospace">{r.revision?.slice(0, 7)}</Anchor>
            : <Text span size="xs" ff="monospace">{r.revision?.slice(0, 7)}</Text>}
          {' '}{r.message?.split('\n')[0]}
        </Text>
      ))}
      {canApprove && approval.token && (
        <Group gap="xs">
          <Button size="compact-xs" color="green" onClick={() => onDecide({ pipeline, approval, decision: 'Approved' })}>Approve</Button>
          <Button size="compact-xs" variant="light" color="red" onClick={() => onDecide({ pipeline, approval, decision: 'Rejected' })}>Reject</Button>
        </Group>
      )}
    </Stack>
  );
}

export function DeploysHealth() {
  const pipelines = useSystemHealth<PipelinesSection>('pipelines');
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ApprovalTarget | null>(null);
  // The section is cached for a minute; after a decision, read it fresh so the page shows it straight away.
  const refresh = async () => {
    const fresh = await controllerApi.getSystemHealth<PipelinesSection>('pipelines', true);
    queryClient.setQueryData(['systemHealth', 'pipelines'], fresh);
  };
  const rows = pipelines.data?.pipelines ?? [];
  const waiting = rows.reduce((sum, p) => sum + p.waitingApprovals.length, 0);
  return (
    <SectionCard
      title="Deploys"
      subtitle="Every CodePipeline: its latest run, failed stage, and approvals waiting"
      loading={pipelines.isLoading}
      error={pipelines.error}
      regionErrors={pipelines.data?.errors}
      right={waiting > 0 && <Badge color="orange" variant="light">{waiting} approval{waiting > 1 ? 's' : ''} waiting</Badge>}
    >
      {rows.length === 0 ? <Text size="sm" c="dimmed">No pipelines in this account.</Text> : (
        <Table verticalSpacing={6} fz="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Pipeline</Table.Th>
              <Table.Th>Latest run</Table.Th>
              <Table.Th>Stages</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(p => (
              <Table.Tr key={`${p.region}/${p.name}`}>
                <Table.Td>
                  <Text size="sm">{p.name}</Text>
                  {p.waitingApprovals.map(w => (
                    <Waiting key={`${w.stage}/${w.action}`} pipeline={p} approval={w}
                      canApprove={!!pipelines.data?.canApprove} onDecide={setTarget} />
                  ))}
                </Table.Td>
                <Table.Td>
                  <Stack gap={0}>
                    <Badge size="xs" variant="light" color={STATUS_COLORS[p.status ?? ''] ?? 'gray'}>{p.status ?? 'never run'}</Badge>
                    {p.updatedAt && <Text size="xs" c="dimmed"><ReactTimeAgo date={new Date(p.updatedAt)} timeStyle="round" /></Text>}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {p.stages.map(s => (
                      <Badge key={s.name} size="xs" variant={s.name === p.failedStage ? 'filled' : 'light'}
                        color={STATUS_COLORS[s.status ?? ''] ?? 'gray'}>{s.name}</Badge>
                    ))}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {pipelines.data && !pipelines.data.canApprove && waiting > 0 && (
        <Text size="xs" c="dimmed" mt="xs">Approvals can be made from the prod controller.</Text>
      )}
      <ApprovalDialog target={target} onClose={() => setTarget(null)} onDecided={refresh} />
    </SectionCard>
  );
}
