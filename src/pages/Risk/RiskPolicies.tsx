import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconHistory, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { RiskPolicy, RISK_POLICY_TYPES } from '../../types';
import { registryApi } from '../../utils/api';
import { formatRiskParameters, scaleRiskParameters } from '../../utils/risk-parameters';
import { errorMessage, findKillSwitch, GLOBAL_TARGET, isKillSwitch, setKillSwitch } from '../../utils/kill-switch';
import { describeTarget, withoutEndedSessions } from '../../utils/policy-target';
import { useListingLabels, useListingSearch } from '../../hooks/useAsyncSearch';
import { StrategySession } from '../../types/strategy-sessions';
import { useLatestPolicyHistory } from '../../hooks/useLatestPolicyHistory';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { RiskPolicyHistoryModal } from '../../components/RiskPolicyHistoryModal';
import { KillSwitchLatestEntry } from '../../components/KillSwitchLatestEntry';

const POLL_INTERVAL_MS = 5000;

function RiskPolicies() {
  const [policies, setPolicies] = useState<RiskPolicy[]>([]);
  const [sessions, setSessions] = useState<StrategySession[]>([]);
  const [strategyNames, setStrategyNames] = useState<Record<number, string>>({});
  const [listingSearch, setListingSearch] = useState('');
  const { options: listingOptions, isLoading: listingSearchLoading } = useListingSearch(listingSearch);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RiskPolicy | null>(null);
  const [toggleTarget, setToggleTarget] = useState<RiskPolicy | null>(null);
  const [killSwitchAction, setKillSwitchAction] = useState<'halt' | 'resume' | null>(null);
  const [historyTarget, setHistoryTarget] = useState<RiskPolicy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState({
    policyType: '',
    strategyId: '',
    listingId: '',
    parametersJson: '{}',
    enabled: true,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [data, sessionList] = await Promise.all([registryApi.listRiskPolicies(), registryApi.listSessions()]);
      setPolicies(data);
      setSessions(sessionList);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e, 'Failed to load risk policies'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    registryApi.listStrategies()
      .then((strategies: { strategyId: number; name: string }[]) =>
        setStrategyNames(Object.fromEntries(strategies.map((s) => [s.strategyId, s.name]))))
      .catch(() => setStrategyNames({}));
  }, []);
  // Polled so a kill switch flipped elsewhere (another operator, or the OMS on a risk breach) shows up quickly.
  useEffect(() => {
    const interval = setInterval(() => refresh(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const killSwitch = findKillSwitch(policies, GLOBAL_TARGET);
  const tradingHalted = killSwitch?.enabled ?? false;
  const latestKillSwitchEntry = useLatestPolicyHistory(killSwitch);

  const confirmKillSwitch = async (reason: string | undefined) => {
    await setKillSwitch(killSwitch, GLOBAL_TARGET, killSwitchAction === 'halt', reason);
    refresh(false);
  };

  const confirmToggleEnabled = async (reason: string | undefined) => {
    if (!toggleTarget) return;
    await registryApi.updateRiskPolicy(toggleTarget.policyId, { enabled: !toggleTarget.enabled, reason });
    refresh(false);
  };

  const handleCreate = async () => {
    setCreateError(null);
    try {
      const parameters = scaleRiskParameters(JSON.parse(policyForm.parametersJson));
      await registryApi.createRiskPolicy({
        policyType: policyForm.policyType,
        strategyId: policyForm.strategyId ? parseInt(policyForm.strategyId) : undefined,
        listingId: policyForm.listingId ? parseInt(policyForm.listingId) : undefined,
        parameters,
        enabled: policyForm.enabled,
      });
      setCreateModalOpen(false);
      setPolicyForm({ policyType: '', strategyId: '', listingId: '', parametersJson: '{}', enabled: true });
      refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create policy');
    }
  };

  const confirmDelete = async (reason: string | undefined) => {
    if (!deleteTarget) return;
    await registryApi.deleteRiskPolicy(deleteTarget.policyId, reason);
    refresh(false);
  };

  const nonKillSwitchPolicies = useMemo(
    () => withoutEndedSessions(policies, sessions).filter((p) => !isKillSwitch(p, GLOBAL_TARGET)),
    [policies, sessions],
  );
  const listingLabels = useListingLabels(
    nonKillSwitchPolicies.flatMap((p) => (p.listingId != null ? [p.listingId] : [])),
  );

  const columns = useMemo<MRT_ColumnDef<RiskPolicy>[]>(() => [
    { accessorKey: 'policyId', header: 'ID', enableSorting: true, size: 60 },
    { accessorKey: 'policyType', header: 'Type', enableSorting: true },
    {
      id: 'appliesTo',
      header: 'Applies to',
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) =>
        describeTarget(row.original, (id) => strategyNames[id], (id) => listingLabels[id]),
    },
    {
      id: 'parameters',
      header: 'Limits',
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) => formatRiskParameters(row.original.parameters),
    },
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
  ], [strategyNames, listingLabels]);

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
      <Group gap={4} justify="center" wrap="nowrap">
        <Tooltip label="History" withArrow openDelay={500}>
          <ActionIcon variant="subtle" color="blue" onClick={() => setHistoryTarget(row.original)}>
            <IconHistory size={16} />
          </ActionIcon>
        </Tooltip>
        <ActionIcon variant="subtle" color="red" onClick={() => setDeleteTarget(row.original)}>
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Risk Policies</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={() => refresh()}>
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

      {loadError && <Alert mb="md" color="red" title="Error">{loadError}</Alert>}

      <Alert
        mb="xl"
        color={tradingHalted ? 'red' : 'green'}
        title={tradingHalted ? 'Trading Halted' : 'Trading Active'}
        icon={tradingHalted ? <IconAlertTriangle size={20} /> : undefined}
      >
        <Group justify="space-between" align="center">
          <Stack gap={4}>
            <Text size="sm">
              {tradingHalted
                ? 'Kill switch is ACTIVE — all open orders were cancelled and all order flow is blocked.'
                : 'All systems go. Kill switch is inactive (trading allowed).'}
            </Text>
            {killSwitch && <KillSwitchLatestEntry entry={latestKillSwitchEntry} enabled={tradingHalted} />}
          </Stack>
          <Group>
            {killSwitch && (
              <Button variant="outline" size="sm" leftSection={<IconHistory size={16} />} onClick={() => setHistoryTarget(killSwitch)}>
                History
              </Button>
            )}
            <Button
              color={tradingHalted ? 'green' : 'red'}
              variant="filled"
              size="sm"
              onClick={() => setKillSwitchAction(tradingHalted ? 'resume' : 'halt')}
            >
              {tradingHalted ? 'RESUME TRADING' : 'HALT ALL TRADING'}
            </Button>
          </Group>
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
          <Select
            label="Strategy"
            description="Leave empty for every strategy"
            placeholder="Every strategy"
            data={Object.entries(strategyNames).map(([id, name]) => ({ value: id, label: `${id} - ${name}` }))}
            value={policyForm.strategyId || null}
            onChange={(v) => setPolicyForm((f) => ({ ...f, strategyId: v ?? '' }))}
            searchable
            clearable
          />
          <Select
            label="Listing"
            description="Leave empty for every listing"
            placeholder="Search listings..."
            data={listingOptions}
            value={policyForm.listingId || null}
            onChange={(v) => setPolicyForm((f) => ({ ...f, listingId: v ?? '' }))}
            searchable
            clearable
            searchValue={listingSearch}
            onSearchChange={setListingSearch}
            nothingFoundMessage={listingSearchLoading ? 'Loading...' : 'No listings found'}
          />
          <Text size="xs" c="dimmed">
            Applies to {describeTarget(
              {
                strategyId: policyForm.strategyId ? parseInt(policyForm.strategyId) : null,
                listingId: policyForm.listingId ? parseInt(policyForm.listingId) : null,
              },
              (id) => strategyNames[id],
            )}
          </Text>
          <Textarea
            label="Parameters (JSON, in dollars and units)"
            description={RISK_POLICY_TYPES.find((t) => t.value === policyForm.policyType)?.parametersHint}
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

      <ReasonConfirmModal
        opened={killSwitchAction === 'halt'}
        onClose={() => setKillSwitchAction(null)}
        title="Halt All Trading"
        message="This will immediately cancel all open orders across every strategy and listing and block all new order flow. Trading stays halted until the kill switch is turned off. Are you sure?"
        confirmLabel="HALT ALL TRADING"
        onConfirm={confirmKillSwitch}
      />

      <ReasonConfirmModal
        opened={killSwitchAction === 'resume'}
        onClose={() => setKillSwitchAction(null)}
        title="Resume Trading"
        message="This will turn off the global kill switch and allow all strategies to send orders again (strategy- and listing-level kill switches still apply). Are you sure?"
        confirmLabel="RESUME TRADING"
        confirmColor="green"
        onConfirm={confirmKillSwitch}
      />

      <ReasonConfirmModal
        opened={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title="Confirm Toggle"
        message={
          <Text>
            {toggleTarget?.enabled ? 'Disable' : 'Enable'} policy <Text span fw={500}>{toggleTarget?.policyType}</Text>?
          </Text>
        }
        confirmLabel={toggleTarget?.enabled ? 'Disable' : 'Enable'}
        confirmColor={toggleTarget?.enabled ? 'red' : 'green'}
        onConfirm={confirmToggleEnabled}
      />

      <ReasonConfirmModal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Delete"
        message={<Text>Delete policy <Text span fw={500}>{deleteTarget?.policyType}</Text>?</Text>}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />

      <RiskPolicyHistoryModal policy={historyTarget} onClose={() => setHistoryTarget(null)} />
    </Container>
  );
}

export default RiskPolicies;
