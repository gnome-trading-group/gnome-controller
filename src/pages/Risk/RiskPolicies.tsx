import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Container,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { RiskPolicy, RISK_POLICY_TYPES } from '../../types';
import { registryApi } from '../../utils/api';

const KILL_SWITCH_TYPE = 'KILL_SWITCH';

function RiskPolicies() {
  const [policies, setPolicies] = useState<RiskPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RiskPolicy | null>(null);
  const [toggleTarget, setToggleTarget] = useState<RiskPolicy | null>(null);
  const [haltConfirmOpen, setHaltConfirmOpen] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    policyType: '',
    scope: 1,
    strategyId: '',
    listingId: '',
    parametersJson: '{}',
    enabled: true,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await registryApi.listRiskPolicies();
      setPolicies(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const killSwitch = policies.find((p) => p.policyType === KILL_SWITCH_TYPE && p.scope === 0);
  const tradingHalted = killSwitch?.enabled ?? false;

  const handleToggleKillSwitch = async () => {
    if (!killSwitch) return;
    if (!tradingHalted) {
      setHaltConfirmOpen(true);
    } else {
      await registryApi.updateRiskPolicy(killSwitch.policyId, { enabled: false });
      refresh();
    }
  };

  const confirmHalt = async () => {
    if (!killSwitch) return;
    await registryApi.updateRiskPolicy(killSwitch.policyId, { enabled: true });
    setHaltConfirmOpen(false);
    refresh();
  };

  const handleToggleEnabled = async (policy: RiskPolicy) => {
    await registryApi.updateRiskPolicy(policy.policyId, { enabled: !policy.enabled });
    refresh();
  };

  const handleCreate = async () => {
    setCreateError(null);
    try {
      const parameters = JSON.parse(policyForm.parametersJson);
      await registryApi.createRiskPolicy({
        policyType: policyForm.policyType,
        scope: policyForm.scope,
        strategyId: policyForm.strategyId ? parseInt(policyForm.strategyId) : undefined,
        listingId: policyForm.listingId ? parseInt(policyForm.listingId) : undefined,
        parameters,
        enabled: policyForm.enabled,
      });
      setCreateModalOpen(false);
      setPolicyForm({ policyType: '', scope: 1, strategyId: '', listingId: '', parametersJson: '{}', enabled: true });
      refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create policy');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await registryApi.deleteRiskPolicy(deleteTarget.policyId);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      console.error('Failed to delete policy:', e);
    }
  };

  const nonKillSwitchPolicies = useMemo(
    () => policies.filter((p) => !(p.policyType === KILL_SWITCH_TYPE && p.scope === 0)),
    [policies],
  );

  const columns = useMemo<MRT_ColumnDef<RiskPolicy>[]>(() => [
    { accessorKey: 'policyId', header: 'ID', enableSorting: true, size: 60 },
    { accessorKey: 'policyType', header: 'Type', enableSorting: true },
    { accessorKey: 'scope', header: 'Scope', enableSorting: true, size: 70 },
    { accessorKey: 'strategyId', header: 'Strategy', enableSorting: true, size: 80 },
    { accessorKey: 'listingId', header: 'Listing', enableSorting: true, size: 80 },
    {
      accessorKey: 'enabled',
      header: 'Enabled',
      size: 80,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) => (
        <Switch
          checked={row.original.enabled}
          onChange={() => setToggleTarget(row.original)}
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

  const table = useMantineReactTable({
    columns,
    data: nonKillSwitchPolicies,
    state: { isLoading: loading },
    enableEditing: false,
    enableRowActions: true,
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    positionActionsColumn: 'last' as const,
    initialState: { sorting: [{ id: 'policyId', desc: false }], density: 'xs' },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderRowActions: ({ row }: { row: MRT_Row<RiskPolicy> }) => (
      <ActionIcon variant="subtle" color="red" onClick={() => setDeleteTarget(row.original)}>
        <IconTrash size={16} />
      </ActionIcon>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Risk Policies</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Add Policy" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setCreateModalOpen(true)}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Alert
        mb="xl"
        color={tradingHalted ? 'red' : 'green'}
        title={tradingHalted ? 'Trading Halted' : 'Trading Active'}
        icon={tradingHalted ? <IconAlertTriangle size={20} /> : undefined}
      >
        <Group justify="space-between" align="center">
          <Text size="sm">
            {tradingHalted
              ? 'Kill switch is ACTIVE — all order flow is blocked.'
              : 'All systems go. Kill switch is inactive (trading allowed).'}
          </Text>
          <Button
            color={tradingHalted ? 'green' : 'red'}
            variant="filled"
            size="sm"
            onClick={handleToggleKillSwitch}
            disabled={!killSwitch}
          >
            {tradingHalted ? 'RESUME TRADING' : 'HALT ALL TRADING'}
          </Button>
        </Group>
      </Alert>

      <MantineReactTable table={table} />

      <Modal opened={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Add Risk Policy" size="md">
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
            description="0 = global, 1 = per-strategy, 2 = per-listing"
            value={policyForm.scope}
            onChange={(v) => setPolicyForm((f) => ({ ...f, scope: Number(v) }))}
          />
          <NumberInput
            label="Strategy ID (optional)"
            value={policyForm.strategyId}
            onChange={(v) => setPolicyForm((f) => ({ ...f, strategyId: v !== '' ? String(v) : '' }))}
          />
          <NumberInput
            label="Listing ID (optional)"
            value={policyForm.listingId}
            onChange={(v) => setPolicyForm((f) => ({ ...f, listingId: v !== '' ? String(v) : '' }))}
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
            onChange={(e) => { const checked = e.currentTarget.checked; setPolicyForm((f) => ({ ...f, enabled: checked })); }}
          />
          {createError && <Text c="red" size="sm">{createError}</Text>}
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Add</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={haltConfirmOpen} onClose={() => setHaltConfirmOpen(false)} title="Halt All Trading" size="sm">
        <Stack>
          <Text>This will immediately disable the kill switch and block all order flow. Are you sure?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setHaltConfirmOpen(false)}>Cancel</Button>
            <Button color="red" onClick={confirmHalt}>HALT ALL TRADING</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!toggleTarget} onClose={() => setToggleTarget(null)} title="Confirm Toggle" size="sm">
        <Stack>
          <Text>
            {toggleTarget?.enabled ? 'Disable' : 'Enable'} policy <Text span fw={500}>{toggleTarget?.policyType}</Text>?
          </Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setToggleTarget(null)}>Cancel</Button>
            <Button
              color={toggleTarget?.enabled ? 'red' : 'green'}
              onClick={() => { handleToggleEnabled(toggleTarget!); setToggleTarget(null); }}
            >
              {toggleTarget?.enabled ? 'Disable' : 'Enable'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Delete" size="sm">
        <Stack>
          <Text>Delete policy <Text span fw={500}>{deleteTarget?.policyType}</Text>?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" onClick={handleDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default RiskPolicies;
