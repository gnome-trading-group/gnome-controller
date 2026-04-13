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
  Select,
  Space,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { PnlSnapshot, RiskPolicy, RISK_POLICY_TYPES, Strategy, StrategyStatus } from '../../types';
import { registryApi } from '../../utils/api';

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
  const [policies, setPolicies] = useState<RiskPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [createPolicyOpen, setCreatePolicyOpen] = useState(false);
  const [deletePolicyTarget, setDeletePolicyTarget] = useState<RiskPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({
    policyType: '',
    scope: 1,
    parametersJson: '{}',
    enabled: true,
  });
  const [policyError, setPolicyError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [allStrategies, pnl, allPolicies] = await Promise.all([
        registryApi.listStrategies({ strategyId: id }),
        registryApi.listPnlLatest(id),
        registryApi.listRiskPolicies(),
      ]);
      setStrategy(allStrategies[0] ?? null);
      setPnlRows(pnl);
      setPolicies(allPolicies.filter((p) => p.scope === 0 ? false : p.strategyId === id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

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

  const pnlColumns = useMemo<MRT_ColumnDef<PnlSnapshot>[]>(() => [
    { accessorKey: 'listingId', header: 'Listing ID', enableSorting: true, size: 80 },
    { accessorKey: 'netQuantity', header: 'Net Qty', enableSorting: true },
    { accessorKey: 'avgEntryPrice', header: 'Avg Entry', enableSorting: true },
    { accessorKey: 'realizedPnl', header: 'Realized PnL', enableSorting: true },
    { accessorKey: 'totalFees', header: 'Fees', enableSorting: true },
    { accessorKey: 'leavesBuyQty', header: 'Leaves Buy', enableSorting: true },
    { accessorKey: 'leavesSellQty', header: 'Leaves Sell', enableSorting: true },
    {
      accessorKey: 'snapshotTime',
      header: 'Snapshot Time',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<PnlSnapshot> }) =>
        row.original.snapshotTime
          ? <ReactTimeAgo date={new Date(row.original.snapshotTime)} timeStyle="round" />
          : '-',
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

  const pnlTable = useMantineReactTable({
    columns: pnlColumns,
    data: pnlRows,
    state: { isLoading: loading },
    enableEditing: false,
    enableRowActions: false,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
  });

  const policyTable = useMantineReactTable({
    columns: policyColumns,
    data: policies,
    state: { isLoading: loading },
    enableEditing: false,
    enableRowActions: true,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: false,
    enableBottomToolbar: false,
    enableTopToolbar: false,
    positionActionsColumn: 'last' as const,
    initialState: { density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderRowActions: ({ row }: { row: MRT_Row<RiskPolicy> }) => (
      <ActionIcon variant="subtle" color="red" onClick={() => setDeletePolicyTarget(row.original)}>
        <IconTrash size={16} />
      </ActionIcon>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group mb="md">
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
        <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={refresh}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Title order={4} mb="xs">PnL Snapshot (latest per listing)</Title>
      <MantineReactTable table={pnlTable} />

      <Space h="xl" />

      <Group justify="space-between" mb="xs">
        <Title order={4}>Risk Policies</Title>
        <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setCreatePolicyOpen(true)}>
          <IconPlus size={20} />
        </ActionIcon>
      </Group>
      <MantineReactTable table={policyTable} />

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
