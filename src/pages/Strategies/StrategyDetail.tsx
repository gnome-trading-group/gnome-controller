import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Space,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAB2, IconArrowLeft, IconEdit, IconPlayerStop, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { navigateRowProps } from '../../utils/navigation';
import { PnlSnapshot, RiskPolicy, RISK_POLICY_TYPES, Strategy, StrategySession, StrategySessionStatus, StrategyStatus } from '../../types';
import { registryApi } from '../../utils/api';
import DeploySessionModal from '../Sessions/DeploySessionModal';
import StrategyFormModal from './StrategyFormModal';
import { PnlSnapshotTable } from '../../components/PnlSnapshotTable';

const SESSION_STATUS_COLORS: Record<string, string> = {
  [StrategySessionStatus.SUBMITTED]: 'blue',
  [StrategySessionStatus.RUNNING]: 'green',
  [StrategySessionStatus.STOPPED]: 'gray',
  [StrategySessionStatus.FAILED]: 'red',
};

const MODE_COLORS: Record<string, string> = {
  paper: 'violet',
  live: 'red',
};

const STATUS_LABELS: Record<number, string> = {
  [StrategyStatus.INACTIVE]: 'Inactive',
  [StrategyStatus.ACTIVE]: 'Active',
  [StrategyStatus.PAUSED]: 'Paused',
};

const STATUS_COLORS: Record<number, string> = {
  [StrategyStatus.INACTIVE]: 'gray',
  [StrategyStatus.ACTIVE]: 'green',
  [StrategyStatus.PAUSED]: 'yellow',
};

function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const navigate = useNavigate();
  const id = parseInt(strategyId ?? '0');

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [pnlRows, setPnlRows] = useState<PnlSnapshot[]>([]);
  const [pnlMode, setPnlMode] = useState<string>('All');
  const [policies, setPolicies] = useState<RiskPolicy[]>([]);
  const [sessions, setSessions] = useState<StrategySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<StrategySession | null>(null);
  const [relaunchSession, setRelaunchSession] = useState<StrategySession | null>(null);
  const [stopping, setStopping] = useState(false);
  const [createPolicyOpen, setCreatePolicyOpen] = useState(false);
  const [deletePolicyTarget, setDeletePolicyTarget] = useState<RiskPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({
    policyType: '',
    scope: 1,
    parametersJson: '{}',
    enabled: true,
  });
  const [policyError, setPolicyError] = useState<string | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [allStrategies, pnl, allPolicies, sessionList] = await Promise.all([
        registryApi.listStrategies({ strategyId: id }),
        registryApi.listPnlLatest(id, pnlMode === 'All' ? 'ALL' : undefined),
        registryApi.listRiskPolicies(),
        registryApi.listSessions({ strategyId: id }),
      ]);
      setStrategy(allStrategies[0] ?? null);
      setPnlRows(pnl);
      setPolicies(allPolicies.filter((p) => p.scope === 0 ? false : p.strategyId === id));
      setSessions(sessionList);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id, pnlMode]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(() => refresh(false), 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleToggleEnabled = async (policy: RiskPolicy) => {
    await registryApi.updateRiskPolicy(policy.policyId, { enabled: !policy.enabled });
    refresh();
  };

  const handleCreatePolicy = async () => {
    setPolicyError(null);
    try {
      const parameters = JSON.parse(policyForm.parametersJson);
      await registryApi.createRiskPolicy({
        policyType: policyForm.policyType,
        scope: policyForm.scope,
        strategyId: id,
        parameters,
        enabled: policyForm.enabled,
      });
      setCreatePolicyOpen(false);
      setPolicyForm({ policyType: '', scope: 1, parametersJson: '{}', enabled: true });
      refresh();
    } catch (e) {
      setPolicyError(e instanceof Error ? e.message : 'Failed to create policy');
    }
  };

  const handleDeletePolicy = async () => {
    if (!deletePolicyTarget) return;
    try {
      await registryApi.deleteRiskPolicy(deletePolicyTarget.policyId);
      setDeletePolicyTarget(null);
      refresh();
    } catch (e) {
      console.error('Failed to delete policy:', e);
    }
  };

  const handleStopSession = async () => {
    if (!stopTarget) return;
    setStopping(true);
    try {
      await registryApi.stopSession(stopTarget.sessionId);
      setStopTarget(null);
      refresh();
    } catch (e) {
      console.error('Failed to stop session:', e);
    } finally {
      setStopping(false);
    }
  };

  const isStoppable = (s: StrategySession) =>
    s.status === StrategySessionStatus.SUBMITTED || s.status === StrategySessionStatus.RUNNING;

  const sessionColumns = useMemo<MRT_ColumnDef<StrategySession>[]>(() => [
    {
      accessorKey: 'sessionId',
      header: 'Session ID',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Tooltip label={row.original.sessionId} position="right" withArrow openDelay={300}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {row.original.sessionId.slice(0, 8)}…
          </span>
        </Tooltip>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 110,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Badge color={SESSION_STATUS_COLORS[row.original.status] ?? 'gray'} variant="light" size="sm">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'mode',
      header: 'Mode',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) => (
        <Badge color={MODE_COLORS[row.original.mode] ?? 'gray'} variant="light" size="sm">
          {row.original.mode}
        </Badge>
      ),
    },
    {
      accessorKey: 'startedAt',
      header: 'Started',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) =>
        row.original.startedAt
          ? <ReactTimeAgo date={new Date(row.original.startedAt)} timeStyle="round" />
          : '—',
    },
    {
      accessorKey: 'stoppedAt',
      header: 'Stopped',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<StrategySession> }) =>
        row.original.stoppedAt
          ? <ReactTimeAgo date={new Date(row.original.stoppedAt)} timeStyle="round" />
          : '—',
    },
  ], []);

  const policyColumns = useMemo<MRT_ColumnDef<RiskPolicy>[]>(() => [
    { accessorKey: 'policyId', header: 'ID', enableSorting: true, size: 60 },
    { accessorKey: 'policyType', header: 'Type', enableSorting: true },
    {
      accessorKey: 'enabled',
      header: 'Enabled',
      size: 80,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) => (
        <Switch
          checked={row.original.enabled}
          onChange={() => handleToggleEnabled(row.original)}
        />
      ),
    },
    {
      accessorKey: 'dateModified',
      header: 'Modified',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) =>
        row.original.dateModified
          ? <ReactTimeAgo date={new Date(row.original.dateModified)} timeStyle="round" />
          : '-',
    },
  ], []);

  const sessionTable = useMantineReactTable({
    columns: sessionColumns,
    data: sessions,
    state: { isLoading: loading },
    enableEditing: false,
    enableRowActions: true,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    positionActionsColumn: 'last' as const,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 }, sorting: [{ id: 'startedAt', desc: true }] },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }: { row: MRT_Row<StrategySession> }) => (
      navigateRowProps(navigate, `/sessions/${row.original.sessionId}`)
    ),
    renderRowActions: ({ row }: { row: MRT_Row<StrategySession> }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="green"
          disabled={isStoppable(row.original)}
          onClick={e => { e.stopPropagation(); setRelaunchSession(row.original); }}
        >
          <IconAB2 size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          disabled={!isStoppable(row.original)}
          onClick={e => { e.stopPropagation(); setStopTarget(row.original); }}
        >
          <IconPlayerStop size={16} />
        </ActionIcon>
      </Group>
    ),
  });

  const policyTable = useMantineReactTable({
    columns: policyColumns,
    data: policies,
    state: { isLoading: loading },
    enableEditing: false,
    enableRowActions: true,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    positionActionsColumn: 'last' as const,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderRowActions: ({ row }: { row: MRT_Row<RiskPolicy> }) => (
      <ActionIcon variant="subtle" color="red" onClick={() => setDeletePolicyTarget(row.original)}>
        <IconTrash size={16} />
      </ActionIcon>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Group>
          <ActionIcon variant="subtle" onClick={() => navigate('/strategies')}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Title order={2}>
            {strategy ? strategy.name : `Strategy ${id}`}
          </Title>
          {strategy && (
            <Badge color={STATUS_COLORS[strategy.status]} variant="light" size="lg">
              {STATUS_LABELS[strategy.status] ?? strategy.status}
            </Badge>
          )}
        </Group>
        <Group>
          <Tooltip label="Edit Strategy" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setEditOpen(true)}>
              <IconEdit size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <PnlSnapshotTable
        title="PnL Snapshot (latest per listing)"
        extraControls={
          <SegmentedControl size="xs" value={pnlMode} onChange={setPnlMode} data={['All', 'Live']} />
        }
        data={pnlRows}
        isLoading={loading}
        showModeColumn
      />

      <Space h="xl" />

      <Group justify="space-between" mb="xs">
        <Title order={4}>Sessions</Title>
        <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setDeployOpen(true)}>
          <IconPlus size={20} />
        </ActionIcon>
      </Group>
      <MantineReactTable table={sessionTable} />

      <Space h="xl" />

      <Group justify="space-between" mb="xs">
        <Title order={4}>Risk Policies</Title>
        <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setCreatePolicyOpen(true)}>
          <IconPlus size={20} />
        </ActionIcon>
      </Group>
      <MantineReactTable table={policyTable} />

      <DeploySessionModal
        opened={deployOpen || !!relaunchSession}
        onClose={() => { setDeployOpen(false); setRelaunchSession(null); }}
        onCreated={(newSessionId) => {
          const wasRelaunch = !!relaunchSession;
          setDeployOpen(false);
          setRelaunchSession(null);
          if (wasRelaunch) navigate(`/sessions/${newSessionId}`);
          else refresh();
        }}
        preselectedStrategyId={id}
        initialSession={relaunchSession}
      />

      <StrategyFormModal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); refresh(); }}
        strategy={strategy}
      />

      <Modal opened={!!stopTarget} onClose={() => setStopTarget(null)} title="Stop Session" size="sm">
        <Stack>
          <Text>Stop session <Text span fw={500} style={{ fontFamily: 'monospace' }}>{stopTarget?.sessionId.slice(0, 8)}…</Text>?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setStopTarget(null)}>Cancel</Button>
            <Button color="red" loading={stopping} onClick={handleStopSession}>Stop</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={createPolicyOpen} onClose={() => setCreatePolicyOpen(false)} title="Add Risk Policy" size="md">
        <Stack>
          <Select
            label="Policy Type"
            data={RISK_POLICY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            value={policyForm.policyType}
            onChange={(v) => {
              const template = RISK_POLICY_TYPES.find((t) => t.value === v)?.parametersTemplate ?? '{}';
              setPolicyForm((f) => ({ ...f, policyType: v ?? '', parametersJson: template }));
            }}
            required
          />
          <NumberInput
            label="Scope"
            description="1 = per-strategy, 2 = per-listing"
            value={policyForm.scope}
            onChange={(v) => setPolicyForm((f) => ({ ...f, scope: Number(v) }))}
          />
          <Textarea
            label="Parameters (JSON)"
            value={policyForm.parametersJson}
            onChange={(e) => setPolicyForm((f) => ({ ...f, parametersJson: e.target.value }))}
            autosize
            minRows={3}
          />
          <Checkbox
            label="Enabled"
            checked={policyForm.enabled}
            onChange={(e) => setPolicyForm((f) => ({ ...f, enabled: e.currentTarget.checked }))}
          />
          {policyError && <Text c="red" size="sm">{policyError}</Text>}
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCreatePolicyOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePolicy}>Add</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!deletePolicyTarget} onClose={() => setDeletePolicyTarget(null)} title="Confirm Delete" size="sm">
        <Stack>
          <Text>Delete policy <Text span fw={500}>{deletePolicyTarget?.policyType}</Text>?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setDeletePolicyTarget(null)}>Cancel</Button>
            <Button color="red" onClick={handleDeletePolicy}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default StrategyDetail;
