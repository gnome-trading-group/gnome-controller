import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Anchor, Badge, Button, Group, Loader, Modal, Paper, ScrollArea, Select, Stack, Table, Tabs, Text, ThemeIcon,
} from '@mantine/core';
import { IconExternalLink, IconFileText, IconPlayerPlay, IconPlayerStop, IconRefresh } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import ReactTimeAgo from 'react-time-ago';
import { PipelineAction, PipelineDetail, PipelineRun, Revision } from '../../types';
import { controllerApi } from '../../utils/api';
import {
  actionsOf, canRetry, defaultStage, firstLine, isActive, shortSha, stagePositions, stageStatus, triggerLabel,
} from '../../utils/deploys';
import { errorMessage } from '../../utils/kill-switch';
import { formatSeconds, pipelineConsoleUrl } from '../../utils/system';
import { RunLogs } from '../RunLogsDrawer';
import { OperationTarget, PipelineOperationDialog } from './PipelineOperationDialog';
import { look } from './stageLook';

const STATUS_COLORS: Record<string, string> = {
  Succeeded: 'teal', InProgress: 'blue', Failed: 'red', Stopped: 'gray', Superseded: 'gray', Stopping: 'gray',
  Abandoned: 'gray', Cancelled: 'gray',
};

const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 30_000;

export interface PipelineDialogTarget {
  name: string;
  region: string;
  // The stage to open on; otherwise the one the run stopped at or is in.
  stage?: string;
}

function StatusBadge({ status }: { status: string | null }) {
  return <Badge size="xs" variant="light" color={STATUS_COLORS[status ?? ''] ?? 'gray'}>{status ?? 'not run'}</Badge>;
}

function Revisions({ revisions }: { revisions: Revision[] }) {
  if (revisions.length === 0) return <Text size="xs" c="dimmed">—</Text>;
  return (
    <Stack gap={0}>
      {revisions.map(r => (
        <Text key={`${r.source}/${r.revision}`} size="xs" lineClamp={1}>
          {r.url
            ? <Anchor href={r.url} target="_blank" size="xs" ff="monospace">{shortSha(r.revision)}</Anchor>
            : <Text span size="xs" ff="monospace">{shortSha(r.revision)}</Text>}
          {' '}<Text span size="xs" c="dimmed">{firstLine(r.message)}</Text>
        </Text>
      ))}
    </Stack>
  );
}

function runLabel(run: PipelineRun): string {
  const commit = run.revisions[0];
  const when = run.startedAt ? new Date(run.startedAt).toLocaleString() : 'not started';
  return `${run.status ?? '?'} · ${commit ? `${shortSha(commit.revision)} ${firstLine(commit.message).slice(0, 50)}` : run.id.slice(0, 8)} · ${when}`;
}

function RunSummary({ run }: { run: PipelineRun }) {
  return (
    <Paper withBorder p="sm" radius="sm">
      <Group gap="lg" align="flex-start" wrap="wrap">
        <Stack gap={2}>
          <Text size="xs" c="dimmed">Status</Text>
          <StatusBadge status={run.status} />
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">Started</Text>
          <Text size="xs">
            {run.startedAt ? <ReactTimeAgo date={new Date(run.startedAt)} timeStyle="round" /> : '—'} by {triggerLabel(run.trigger, run.triggerDetail)}
          </Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">{isActive(run.status) ? 'Running for' : 'Took'}</Text>
          <Text size="xs">{formatSeconds(run.durationSeconds)}</Text>
        </Stack>
        <Stack gap={2} style={{ flex: 1, minWidth: 240 }}>
          <Text size="xs" c="dimmed">Commits</Text>
          <Revisions revisions={run.revisions} />
        </Stack>
      </Group>
      {run.statusSummary && <Text size="xs" c="dimmed" mt="xs">{run.statusSummary}</Text>}
    </Paper>
  );
}

// What each stage last succeeded with: which commit dev and prod are on, and which are behind.
function StagePositions({ detail }: { detail: PipelineDetail }) {
  return (
    <Table fz="xs" verticalSpacing={4} withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Stage</Table.Th>
          <Table.Th>Last succeeded</Table.Th>
          <Table.Th>With</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {stagePositions(detail).map(p => (
          <Table.Tr key={p.stage}>
            <Table.Td fw={500}>{p.stage}</Table.Td>
            <Table.Td>{p.at ? <ReactTimeAgo date={new Date(p.at)} timeStyle="round" /> : p.runId ? '—' : 'not in recent history'}</Table.Td>
            <Table.Td><Revisions revisions={p.revisions} /></Table.Td>
            <Table.Td>
              {p.runId && (
                <Badge size="xs" variant="light" color={p.current ? 'teal' : 'orange'}>{p.current ? 'latest' : 'behind'}</Badge>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function ActionRow({ action, showingLogs, onLogs }: {
  action: PipelineAction; showingLogs: boolean; onLogs: () => void;
}) {
  return (
    <>
      <Table.Tr>
        <Table.Td>
          <Text size="xs" fw={500}>{action.action}</Text>
          <Text size="xs" c="dimmed">{action.provider ?? action.category}{action.stackName ? ` · ${action.stackName}` : ''}</Text>
        </Table.Td>
        <Table.Td><StatusBadge status={action.status} /></Table.Td>
        <Table.Td>
          <Text size="xs">{action.startedAt ? <ReactTimeAgo date={new Date(action.startedAt)} timeStyle="round" /> : '—'}</Text>
        </Table.Td>
        <Table.Td><Text size="xs">{formatSeconds(action.durationSeconds)}</Text></Table.Td>
        <Table.Td>
          <Group gap="xs" wrap="nowrap" justify="flex-end">
            {action.buildId && (
              <Button size="compact-xs" variant={showingLogs ? 'filled' : 'light'} leftSection={<IconFileText size={12} />}
                onClick={onLogs}>
                Logs
              </Button>
            )}
            {action.url && (
              <Anchor href={action.url} target="_blank" size="xs">
                <Group gap={2} wrap="nowrap">Console <IconExternalLink size={12} /></Group>
              </Anchor>
            )}
          </Group>
        </Table.Td>
      </Table.Tr>
      {(action.error || (action.summary && action.status !== 'Succeeded')) && (
        <Table.Tr>
          <Table.Td colSpan={5} pt={0}>
            <Text size="xs" c={action.error ? 'red' : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
              {action.error ?? action.summary}
            </Text>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

function StagePanel({ detail, stage, onOperate }: {
  detail: PipelineDetail; stage: string; onOperate: (target: OperationTarget) => void;
}) {
  const actions = actionsOf(detail, stage);
  const [logsFor, setLogsFor] = useState<PipelineAction | null>(null);
  const shown = logsFor && actions.find(a => a.buildId === logsFor.buildId);
  const buildId = shown?.buildId ?? null;
  const loadLogs = useCallback(
    (before?: string) => controllerApi.getPipelineBuildLogs(detail.name, detail.region, buildId as string, before),
    [detail.name, detail.region, buildId],
  );

  return (
    <Stack gap="sm">
      {canRetry(detail, stage) && detail.runId && (
        <Alert color="red" variant="light" p="xs">
          <Group justify="space-between">
            <Text size="sm">{stage} {stageStatus(detail, stage) === 'Stopped' ? 'was stopped' : 'failed'} in this run.</Text>
            {detail.canOperate ? (
              <Group gap="xs">
                <Button size="compact-sm" leftSection={<IconRefresh size={14} />}
                  onClick={() => onOperate({ operation: 'retry', runId: detail.runId as string, stage, mode: 'FAILED_ACTIONS' })}>
                  Retry failed actions
                </Button>
                <Button size="compact-sm" variant="light"
                  onClick={() => onOperate({ operation: 'retry', runId: detail.runId as string, stage, mode: 'ALL_ACTIONS' })}>
                  Retry all
                </Button>
              </Group>
            ) : <Text size="xs" c="dimmed">Retry from the prod controller.</Text>}
          </Group>
        </Alert>
      )}
      {actions.length === 0 ? (
        <Text size="sm" c="dimmed">This run hasn't reached {stage}.</Text>
      ) : (
        <Table fz="xs" verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Action</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Took</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {actions.map(a => (
              <ActionRow key={a.action} action={a} showingLogs={!!buildId && a.buildId === buildId}
                onLogs={() => setLogsFor(buildId && a.buildId === buildId ? null : a)} />
            ))}
          </Table.Tbody>
        </Table>
      )}
      {shown && buildId && (
        <Paper withBorder p="sm" radius="sm">
          <Text size="sm" fw={500} mb="xs">{shown.action} logs</Text>
          <RunLogs key={buildId} load={loadLogs} active={isActive(shown.status)} height={360}
            emptyText="No log lines yet — they appear once the build starts." />
        </Paper>
      )}
    </Stack>
  );
}

// One pipeline: pick a run, see each stage's actions with their errors and build logs, where every stage last
// succeeded, and (on the prod controller) retry, release or stop.
export function PipelineDialog({ target, onClose, onChanged }: {
  target: PipelineDialogTarget | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [operation, setOperation] = useState<OperationTarget | null>(null);

  useEffect(() => {
    setRunId(null);
    setStage(target?.stage ?? null);
  }, [target]);

  const detail = useQuery({
    queryKey: ['pipelineDetail', target?.name, target?.region, runId],
    queryFn: () => controllerApi.getPipelineDetail(target!.name, target!.region, runId ?? undefined),
    enabled: !!target,
    // Switching runs keeps the last one on screen until the next arrives.
    placeholderData: keepPreviousData,
    refetchInterval: query => {
      const data = query.state.data;
      const active = !!data && (isActive(data.run?.status) || data.actions.some(a => isActive(a.status)));
      return active ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    },
  });

  const data = detail.data;
  const shownStage = stage && data?.stages.some(s => s.name === stage) ? stage : data ? defaultStage(data) : null;

  if (!target) return null;
  return (
    <Modal
      opened
      onClose={onClose}
      size="min(1100px, 95vw)"
      title={
        <Group gap="xs">
          <Text fw={600}>{target.name}</Text>
          <Anchor href={pipelineConsoleUrl(target.region, target.name)} target="_blank" size="xs">
            <Group gap={2}>CodePipeline <IconExternalLink size={12} /></Group>
          </Anchor>
        </Group>
      }
    >
      {detail.isLoading ? <Loader size="sm" /> : detail.error ? (
        <Alert color="red">{errorMessage(detail.error, 'Failed to load the pipeline')}</Alert>
      ) : data && (
        <Stack gap="md">
          <Group justify="space-between" align="flex-end">
            <Select
              label="Run"
              size="xs"
              w={520}
              data={data.runs.map(r => ({ value: r.id, label: runLabel(r) }))}
              value={data.runId}
              onChange={value => value && setRunId(value)}
              allowDeselect={false}
            />
            {data.canOperate ? (
              <Group gap="xs">
                {data.run && isActive(data.run.status) && (
                  <Button size="xs" color="red" variant="light" leftSection={<IconPlayerStop size={14} />}
                    onClick={() => setOperation({ operation: 'stop', runId: data.run!.id })}>
                    Stop run
                  </Button>
                )}
                <Button size="xs" variant="light" leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => setOperation({ operation: 'release' })}>
                  Release change
                </Button>
              </Group>
            ) : <Text size="xs" c="dimmed">Retry, release and stop from the prod controller.</Text>}
          </Group>

          {data.run && <RunSummary run={data.run} />}

          <Tabs value={shownStage} onChange={setStage} keepMounted={false}>
            <ScrollArea type="auto" scrollbarSize={6}>
              <Tabs.List style={{ flexWrap: 'nowrap' }}>
                {data.stages.map(s => {
                  const status = stageStatus(data, s.name);
                  const waiting = status === 'InProgress'
                    && actionsOf(data, s.name).some(a => a.category === 'Approval' && a.status === 'InProgress');
                  const { color, icon } = look(status, waiting);
                  return (
                    <Tabs.Tab key={s.name} value={s.name}
                      leftSection={<ThemeIcon size={18} radius="xl" variant="light" color={color}>{icon}</ThemeIcon>}>
                      {s.name}
                    </Tabs.Tab>
                  );
                })}
              </Tabs.List>
            </ScrollArea>
            {data.stages.map(s => (
              <Tabs.Panel key={s.name} value={s.name} pt="sm">
                <StagePanel detail={data} stage={s.name} onOperate={setOperation} />
              </Tabs.Panel>
            ))}
          </Tabs>

          <Stack gap={4}>
            <Text size="sm" fw={500}>Where each stage is</Text>
            <StagePositions detail={data} />
          </Stack>
        </Stack>
      )}
      <PipelineOperationDialog
        pipeline={target.name}
        target={operation}
        onClose={() => setOperation(null)}
        onDone={newRunId => {
          setRunId(newRunId);
          detail.refetch();
          onChanged();
        }}
      />
    </Modal>
  );
}
