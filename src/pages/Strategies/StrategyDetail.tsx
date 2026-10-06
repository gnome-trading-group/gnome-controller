import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  SegmentedControl,
  Space,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAB2, IconAlertTriangle, IconArrowLeft, IconEdit, IconHistory, IconPencil, IconPlayerPlay, IconPlayerStop, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { navigateRowProps } from '../../utils/navigation';
import { PnlSnapshot, RiskPolicy, Strategy, StrategySession, isActiveSession } from '../../types';
import { strategyActivity } from '../../utils/strategy-activity';
import { registryApi } from '../../utils/api';
import { formatRiskParameters } from '../../utils/risk-parameters';
import DeploySessionModal from '../Sessions/DeploySessionModal';
import StrategyFormModal from './StrategyFormModal';
import { PnlSnapshotTable } from '../../components/PnlSnapshotTable';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { RiskPolicyHistoryModal } from '../../components/RiskPolicyHistoryModal';
import { KillSwitchLatestEntry } from '../../components/KillSwitchLatestEntry';
import { StopSessionModal } from '../Sessions/StopSessionModal';
import { useLatestPolicyHistory } from '../../hooks/useLatestPolicyHistory';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { errorMessage, findKillSwitch, isKilled, KILL_SWITCH_TYPE, listingKills, setKillSwitch } from '../../utils/kill-switch';
import { KillOnListingModal } from '../../components/KillOnListingModal';
import { ListingKillList } from '../../components/ListingKillList';
import { LastUpdated } from '../../components/LastUpdated';
import {
  configuredListings,
  describeTarget,
  isActiveSessionStatus,
  isUnrelatedListingPolicy,
  policiesForStrategy,
  policyLevel,
  withoutEndedSessions,
} from '../../utils/policy-target';
import { useListingLabels } from '../../hooks/useAsyncSearch';
import { AddRiskPolicyModal } from '../../components/AddRiskPolicyModal';
import { EditRiskPolicyModal } from '../../components/EditRiskPolicyModal';
import { SESSION_STATUS_COLORS } from '../../utils/session-status';

const MODE_COLORS: Record<string, string> = {
  paper: 'violet',
  live: 'red',
};

const POLL_INTERVAL_MS = 10000;

function StrategyDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const navigate = useNavigate();
  const id = parseInt(strategyId ?? '0');

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [pnlRows, setPnlRows] = useState<PnlSnapshot[]>([]);
  const [pnlMode, setPnlMode] = useState<string>('All');
  const [policies, setPolicies] = useState<RiskPolicy[]>([]);
  const [policiesLoaded, setPoliciesLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sessions, setSessions] = useState<StrategySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [stopTarget, setStopTarget] = useState<StrategySession | null>(null);
  const [relaunchSession, setRelaunchSession] = useState<StrategySession | null>(null);
  const [createPolicyOpen, setCreatePolicyOpen] = useState(false);
  const [deletePolicyTarget, setDeletePolicyTarget] = useState<RiskPolicy | null>(null);
  const [toggleTarget, setToggleTarget] = useState<RiskPolicy | null>(null);
  const [editPolicyTarget, setEditPolicyTarget] = useState<RiskPolicy | null>(null);
  const [historyTarget, setHistoryTarget] = useState<RiskPolicy | null>(null);
  const [killAction, setKillAction] = useState<'kill' | 'resume' | null>(null);
  const [killOnListingOpen, setKillOnListingOpen] = useState(false);
  const [showAllListingPolicies, setShowAllListingPolicies] = useState(false);

  const beginRefresh = useLatestRequest();

  const refresh = useCallback(async (showLoading = true) => {
    const isCurrent = beginRefresh();
    if (showLoading) setLoading(true);
    try {
      const [allStrategies, pnl, allPolicies, sessionList] = await Promise.all([
        registryApi.listStrategies({ strategyId: id }),
        registryApi.listPnlLatest(id, pnlMode === 'All' ? 'ALL' : undefined),
        registryApi.listRiskPolicies(),
        registryApi.listSessions({ strategyId: id }),
      ]);
      if (!isCurrent()) return;
      setStrategy(allStrategies[0] ?? null);
      setPnlRows(pnl);
      setPolicies(withoutEndedSessions(policiesForStrategy(allPolicies, id), sessionList));
      setPoliciesLoaded(true);
      setSessions(sessionList);
      setLoadError(null);
      setLastUpdated(new Date());
    } catch (e) {
      if (!isCurrent()) return;
      setLoadError(errorMessage(e, 'Failed to load strategy'));
    } finally {
      // Not gated on showLoading: a superseded load skips this, so the newest must clear a spinner it didn't start.
      if (isCurrent()) setLoading(false);
    }
  }, [id, pnlMode, beginRefresh]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(() => refresh(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const tradedListings = useMemo(
    () => configuredListings(sessions.filter((s) => isActiveSessionStatus(s.status))),
    [sessions],
  );
  const hiddenListingPolicies = policies.filter((p) => isUnrelatedListingPolicy(p, tradedListings)).length;
  const shownPolicies = useMemo(
    () => (showAllListingPolicies ? policies : policies.filter((p) => !isUnrelatedListingPolicy(p, tradedListings))),
    [policies, tradedListings, showAllListingPolicies],
  );
  const listingLabels = useListingLabels(shownPolicies.flatMap((p) => (p.listingId != null ? [p.listingId] : [])));
  const killSwitchTarget = useMemo(() => ({ strategyId: id }), [id]);
  const killSwitch = findKillSwitch(policies, killSwitchTarget);
  const strategyKilled = isKilled(policiesLoaded ? policies : null, killSwitchTarget);
  const latestKillSwitchEntry = useLatestPolicyHistory(killSwitch);

  const activity = strategyActivity(id, sessions, policiesLoaded ? policies : null);

  const confirmKillAction = async (reason: string | undefined) => {
    await setKillSwitch(killSwitch, killSwitchTarget, killAction === 'kill', reason);
    refresh(false);
  };

  const confirmToggleEnabled = async (reason: string | undefined) => {
    if (!toggleTarget) return;
    await registryApi.updateRiskPolicy(toggleTarget.policyId, { enabled: !toggleTarget.enabled, reason });
    refresh(false);
  };

  const confirmDeletePolicy = async (reason: string | undefined) => {
    if (!deletePolicyTarget) return;
    await registryApi.deleteRiskPolicy(deletePolicyTarget.policyId, reason);
    refresh(false);
  };

  const isStoppable = (s: StrategySession) => isActiveSession(s.status);

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
    {
      id: 'level',
      header: 'Level',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) => {
        const level = policyLevel(row.original);
        return <Badge color={level.color} variant="outline">{level.label}</Badge>;
      },
    },
    { accessorKey: 'policyType', header: 'Type', enableSorting: true },
    {
      id: 'appliesTo',
      header: 'Applies to',
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) =>
        describeTarget(row.original, () => strategy?.name, (listingId) => listingLabels[listingId]),
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
          // Global and listing-wide policies cover other strategies too; they're changed from the Risk page.
          disabled={row.original.strategyId == null}
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
  ], [strategy?.name, listingLabels]);

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
    data: shownPolicies,
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
      <Group gap={4} justify="center" wrap="nowrap">
        <Tooltip label="History" withArrow openDelay={500}>
          <ActionIcon variant="subtle" color="blue" onClick={() => setHistoryTarget(row.original)}>
            <IconHistory size={16} />
          </ActionIcon>
        </Tooltip>
        {row.original.policyType !== KILL_SWITCH_TYPE && (
          <Tooltip label="Edit limits" withArrow openDelay={500}>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={row.original.strategyId == null}
              onClick={() => setEditPolicyTarget(row.original)}
            >
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon
          variant="subtle"
          color="red"
          disabled={row.original.strategyId == null}
          onClick={() => setDeletePolicyTarget(row.original)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
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
          {strategy && <Badge color={activity.color} variant="light" size="lg">{activity.label}</Badge>}
          {strategy?.archived && <Badge color="gray" variant="outline" size="lg">Archived</Badge>}
        </Group>
        <Group>
          <LastUpdated at={lastUpdated} intervalMs={POLL_INTERVAL_MS} failing={loadError !== null} />
          {strategyKilled === null ? (
            <Button variant="default" disabled>Kill status unknown</Button>
          ) : (
            <Button
              color={strategyKilled ? 'green' : 'red'}
              leftSection={strategyKilled ? <IconPlayerPlay size={16} /> : <IconPlayerStop size={16} />}
              onClick={() => setKillAction(strategyKilled ? 'resume' : 'kill')}
            >
              {strategyKilled ? 'Resume strategy' : 'Kill strategy'}
            </Button>
          )}
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

      {loadError && (
        <Alert mb="md" color="red" title="Error">
          {loadError}
          {policiesLoaded ? ' — showing the last state that loaded.' : " — this strategy's kill switch status is unknown."}
        </Alert>
      )}

      {strategyKilled && (
        <Alert mb="xl" color="red" title="Strategy Killed" icon={<IconAlertTriangle size={20} />}>
          <Group justify="space-between" align="center">
            <Stack gap={4}>
              <Text size="sm">
                Kill switch is ACTIVE — all of this strategy's open orders were cancelled and its sessions cannot send orders until it is resumed.
              </Text>
              <KillSwitchLatestEntry entry={latestKillSwitchEntry} enabled />
            </Stack>
            {killSwitch && (
              <Button variant="outline" size="sm" leftSection={<IconHistory size={16} />} onClick={() => setHistoryTarget(killSwitch)}>
                History
              </Button>
            )}
          </Group>
        </Alert>
      )}

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
        <Group gap="xs">
          <Switch
            size="xs"
            label={`Show all listing policies${hiddenListingPolicies ? ` (${hiddenListingPolicies} hidden)` : ''}`}
            checked={showAllListingPolicies}
            onChange={(e) => setShowAllListingPolicies(e.currentTarget.checked)}
          />
          <Button size="xs" variant="light" color="red" disabled={!policiesLoaded} onClick={() => setKillOnListingOpen(true)}>
            Kill on listing
          </Button>
          <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setCreatePolicyOpen(true)}>
            <IconPlus size={20} />
          </ActionIcon>
        </Group>
      </Group>
      <ListingKillList
        kills={listingKills(policies)}
        describe={(p) => describeTarget(p, () => strategy?.name, (listingId) => listingLabels[listingId])}
        level={policyLevel}
        onResumed={() => refresh(false)}
      />
      <MantineReactTable table={policyTable} />
      <KillOnListingModal
        opened={killOnListingOpen}
        onClose={() => setKillOnListingOpen(false)}
        target={{ strategyId: id }}
        targetLabel={`every session of strategy ${strategy?.name ?? id}`}
        policies={policies}
        onKilled={() => refresh(false)}
      />

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

      <StopSessionModal
        session={stopTarget}
        onClose={() => setStopTarget(null)}
        onStopped={() => refresh(false)}
      />

      <ReasonConfirmModal
        opened={killAction === 'kill'}
        onClose={() => setKillAction(null)}
        title="Kill Strategy"
        message={`This will immediately cancel all open orders for strategy ${strategy?.name ?? id} and block all of its sessions from sending orders. The strategy stays killed until resumed. Are you sure?`}
        confirmLabel="Kill strategy"
        onConfirm={confirmKillAction}
      />

      <ReasonConfirmModal
        opened={killAction === 'resume'}
        onClose={() => setKillAction(null)}
        title="Resume Strategy"
        message={`This will turn off the kill switch for strategy ${strategy?.name ?? id} and allow its running sessions to send orders again. Are you sure?`}
        confirmLabel="Resume strategy"
        confirmColor="green"
        onConfirm={confirmKillAction}
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

      <RiskPolicyHistoryModal policy={historyTarget} onClose={() => setHistoryTarget(null)} />

      <EditRiskPolicyModal
        policy={editPolicyTarget}
        targetDescription={strategy?.name}
        onClose={() => setEditPolicyTarget(null)}
        onSaved={() => refresh(false)}
      />

      <AddRiskPolicyModal
        opened={createPolicyOpen}
        onClose={() => setCreatePolicyOpen(false)}
        target={{ strategyId: id }}
        targetLabel="this strategy"
        onCreated={() => refresh()}
      />

      <ReasonConfirmModal
        opened={!!deletePolicyTarget}
        onClose={() => setDeletePolicyTarget(null)}
        title="Confirm Delete"
        message={<Text>Delete policy <Text span fw={500}>{deletePolicyTarget?.policyType}</Text>?</Text>}
        confirmLabel="Delete"
        onConfirm={confirmDeletePolicy}
      />
    </Container>
  );
}

export default StrategyDetail;
