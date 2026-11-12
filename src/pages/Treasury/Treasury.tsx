import { useCallback, useMemo, useState } from 'react';
import {
  ActionIcon, Alert, Badge, Button, Card, Container, Group, Select, Switch, Text, Title, Tooltip,
} from '@mantine/core';
import { IconAlertOctagon, IconArrowsExchange, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AccountStatus, TRANSFER_KINDS, TRANSFER_PROGRAMS, TransferKind, TransferProgram } from '../../types/treasury';
import { keys, POLL, useRiskPolicies, useTransfers, useTreasurySummary, useVenueAccounts } from '../../query/hooks';
import { useExchangeName } from '../../hooks/useExchangeName';
import { findKillSwitch, KILL_SWITCH_TYPE, setKillSwitch } from '../../utils/kill-switch';
import { registryApi } from '../../utils/api';
import { programLabel, treasuryTotals } from '../../utils/treasury';
import { LastUpdated } from '../../components/LastUpdated';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { Kpi, KpiStrip, ModeBand } from '../../components/trading/layout';
import { Money } from '../../components/trading/values';
import { AccountAction, AccountsTable } from './AccountsTable';
import { AccountStatusModal } from './AccountStatusModal';
import { RegisterAccountModal } from './RegisterAccountModal';
import { RecordTransferModal } from './RecordTransferModal';
import { AccountSettingsModal } from './AccountSettingsModal';
import { DeleteSecretsModal } from './DeleteSecretsModal';
import { ManualSnapshotModal } from './ManualSnapshotModal';
import { ReconPanel } from './ReconPanel';
import { RewardsPanel } from './RewardsPanel';
import { TransfersTable } from './TransfersTable';
import { AccountRow } from './types';

interface Venue {
  exchangeId: number;
  name: string;
  rows: AccountRow[];
}

// The live money: every venue account, what it holds and what is promised out of it, whether it agrees with the
// ledger, and its lifecycle. Venue-wide halts live here too, beside the accounts they stop.
function Treasury() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('account') ? Number(params.get('account')) : null;
  const accounts = useVenueAccounts();
  const summary = useTreasurySummary();
  const policies = useRiskPolicies();
  const exchangeName = useExchangeName();
  const [showRetired, setShowRetired] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ row: AccountRow; status: AccountStatus } | null>(null);
  // undefined while closed; null opens it to pick an account.
  const [transferFor, setTransferFor] = useState<number | null | undefined>(undefined);
  const [settingsFor, setSettingsFor] = useState<AccountRow | null>(null);
  const [snapshotFor, setSnapshotFor] = useState<AccountRow | null>(null);
  const [deleteSecretsFor, setDeleteSecretsFor] = useState<AccountRow | null>(null);
  const [credentialsFor, setCredentialsFor] = useState<AccountRow | null>(null);
  const [haltTarget, setHaltTarget] = useState<{ venue: Venue; halt: boolean } | null>(null);
  const [accountHalt, setAccountHalt] = useState<{ row: AccountRow; halt: boolean } | null>(null);
  const [emergencyFor, setEmergencyFor] = useState<AccountRow | null>(null);
  const [emergencyStarted, setEmergencyStarted] = useState<string | null>(null);

  const rows = useMemo<AccountRow[]>(() => {
    const money = new Map((summary.data?.accounts ?? []).map((a) => [a.accountId, a]));
    return (accounts.data ?? []).map((account) => ({ account, treasury: money.get(account.accountId) }));
  }, [accounts.data, summary.data]);
  const selected = rows.find((r) => r.account.accountId === selectedId) ?? null;

  // Every venue with an account, and any other with a venue halt on so it can be lifted.
  const venues = useMemo<Venue[]>(() => {
    const byExchange = new Map<number, AccountRow[]>();
    for (const row of rows) {
      if (row.account.status === 'RETIRED' && !showRetired) continue;
      byExchange.set(row.account.exchangeId, [...(byExchange.get(row.account.exchangeId) ?? []), row]);
    }
    for (const p of policies.data ?? []) {
      if (p.policyType === KILL_SWITCH_TYPE && p.enabled && p.exchangeId != null && p.strategyId == null
        && p.sessionId == null && !byExchange.has(p.exchangeId)) {
        byExchange.set(p.exchangeId, []);
      }
    }
    return [...byExchange.entries()]
      .sort(([a], [b]) => a - b)
      .map(([exchangeId, venueRows]) => ({
        exchangeId,
        name: exchangeName(exchangeId) ?? venueRows[0]?.account.exchangeCode ?? `Exchange ${exchangeId}`,
        rows: venueRows,
      }));
  }, [rows, policies.data, showRetired, exchangeName]);

  const totals = treasuryTotals(summary.data?.accounts ?? []);
  const retiredCount = rows.filter((r) => r.account.status === 'RETIRED').length;
  const [kindFilter, setKindFilter] = useState<TransferKind | null>(null);
  const [programFilter, setProgramFilter] = useState<TransferProgram | null>(null);
  const transfers = useTransfers({
    accountId: selectedId ?? undefined, kind: kindFilter ?? undefined, program: programFilter ?? undefined,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: keys.venueAccounts });
    queryClient.invalidateQueries({ queryKey: keys.treasury });
    queryClient.invalidateQueries({ queryKey: keys.policies });
  };

  const select = (accountId: number | null) => setParams((current) => {
    const updated = new URLSearchParams(current);
    if (accountId === null || accountId === selectedId) updated.delete('account');
    else updated.set('account', String(accountId));
    return updated;
  }, { replace: true });

  const onAction = (row: AccountRow, action: AccountAction) => {
    if (action.kind === 'status') setStatusTarget({ row, status: action.status });
    else if (action.kind === 'transfer') setTransferFor(row.account.accountId);
    else if (action.kind === 'settings') setSettingsFor(row);
    else if (action.kind === 'deleteSecrets') setDeleteSecretsFor(row);
    else if (action.kind === 'credentials') setCredentialsFor(row);
    else if (action.kind === 'halt') setAccountHalt({ row, halt: action.halt });
    else if (action.kind === 'emergencyCancel') setEmergencyFor(row);
    else setSnapshotFor(row);
  };

  const venueKill = (exchangeId: number) => findKillSwitch(policies.data ?? null, { exchangeId });
  const confirmHalt = async (reason: string | undefined) => {
    if (!haltTarget) return;
    const { venue, halt } = haltTarget;
    await setKillSwitch(venueKill(venue.exchangeId), { exchangeId: venue.exchangeId }, halt, reason);
    queryClient.invalidateQueries({ queryKey: keys.policies });
  };

  const accountKill = (accountId: number) => findKillSwitch(policies.data ?? null, { accountId });
  const accountHalted = useCallback(
    (accountId: number) => (policies.data ? !!findKillSwitch(policies.data, { accountId })?.enabled : null),
    [policies.data],
  );
  const confirmAccountHalt = async (reason: string | undefined) => {
    if (!accountHalt) return;
    const { accountId } = accountHalt.row.account;
    await setKillSwitch(accountKill(accountId), { accountId }, accountHalt.halt, reason);
    queryClient.invalidateQueries({ queryKey: keys.policies });
  };

  const confirmEmergencyCancel = async (reason: string | undefined) => {
    if (!emergencyFor) return;
    if (!reason) throw new Error('A reason is required: every emergency cancel is on the record');
    const started = await registryApi.emergencyCancel(emergencyFor.account.accountId, reason);
    setEmergencyStarted(`Emergency cancel started on ${started.label} (${started.exchange}, ${started.region}). `
      + 'Its result comes as an EMERGENCY_CANCEL alert.');
  };

  const loadError = accounts.error ?? summary.error;
  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Title order={2}>Treasury &amp; Accounts</Title>
          <LastUpdated at={summary.dataUpdatedAt ? new Date(summary.dataUpdatedAt) : null} intervalMs={POLL.treasury}
            failing={!!loadError} compact />
        </Group>
        <Group gap="xs">
          <Switch size="xs" label={`Show retired${retiredCount ? ` (${retiredCount})` : ''}`} checked={showRetired}
            onChange={(e) => setShowRetired(e.currentTarget.checked)} />
          <Button variant="light" leftSection={<IconArrowsExchange size={16} />} onClick={() => setTransferFor(selectedId)}>
            Record transfer
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setRegisterOpen(true)}>Register account</Button>
          <Tooltip label="Refresh" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="subtle" onClick={refresh}><IconRefresh size={18} /></ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <ModeBand mode="live" />

      {emergencyStarted && (
        <Alert mb="md" color="orange" title="Emergency cancel" withCloseButton onClose={() => setEmergencyStarted(null)}>
          {emergencyStarted}
        </Alert>
      )}

      {loadError && (
        <Alert mb="md" color="red" title="Couldn't load the treasury">{loadError.message}</Alert>
      )}

      <KpiStrip>
        <Kpi label="Cash" hint="All cash across the live accounts, including what resting orders hold" value={<Money value={totals.cashTotal} pnl={false} />} />
        <Kpi label="Redeemable" hint="Resolved Polymarket positions waiting to be redeemed, at their payout" value={<Money value={totals.redeemable} pnl={false} />} />
        <Kpi label="Equity at cost" hint="Cash, redeemable payouts and positions at what they cost" value={<Money value={totals.base} pnl={false} />} />
        <Kpi label="Committed" hint="What positions and working orders tie up now" value={<Money value={totals.committed} pnl={false} />} />
        <Kpi label="Allocated" hint="Active live sessions' committed-capital budgets on their accounts, plus positions no session holds" value={<Money value={totals.allocated} pnl={false} />} />
        <Kpi label="Free" hint="Equity at cost less each account's buffer and allocations. Each account's own free is what a launch on it is checked against; one account's surplus never covers another's"
          value={<Money value={totals.free} pnl={false} c={totals.free < 0n ? 'red' : undefined} />} />
      </KpiStrip>

      {venues.length === 0 && !accounts.isLoading && (
        <Card withBorder mb="md"><Text size="sm" c="dimmed">No venue accounts yet. Register one to start trading live.</Text></Card>
      )}

      {venues.map((venue) => {
        const kill = venueKill(venue.exchangeId);
        const halted = !!kill?.enabled;
        const venueTotals = treasuryTotals(venue.rows.flatMap((r) => (r.treasury ? [r.treasury] : [])));
        return (
          <Card key={venue.exchangeId} withBorder mb="md" p="sm">
            <Group justify="space-between" mb="xs">
              <Group gap="sm">
                <Text fw={700}>{venue.name}</Text>
                {halted && <Badge color="red" leftSection={<IconAlertOctagon size={12} />}>halted</Badge>}
                <Text size="sm" c="dimmed">
                  cash <Money value={venueTotals.cashTotal} pnl={false} size="sm" /> · allocated{' '}
                  <Money value={venueTotals.allocated} pnl={false} size="sm" /> · free{' '}
                  <Money value={venueTotals.free} pnl={false} size="sm" c={venueTotals.free < 0n ? 'red' : undefined} />
                </Text>
              </Group>
              <Tooltip
                label={halted ? 'Let every strategy trade on this venue again' : 'Cancel and block every order on this venue, for every strategy'}
                withArrow
              >
                <Button size="xs" variant={halted ? 'filled' : 'light'} color={halted ? 'green' : 'red'}
                  disabled={!policies.data} onClick={() => setHaltTarget({ venue, halt: !halted })}>
                  {halted ? 'Resume venue' : 'Halt venue'}
                </Button>
              </Tooltip>
            </Group>
            <AccountsTable rows={venue.rows} loading={accounts.isLoading} selectedId={selectedId} halted={accountHalted}
              onSelect={(id) => select(id)} onAction={onAction} />
          </Card>
        );
      })}

      {selected && (
        <Card withBorder mb="md" p="sm">
          <Group justify="space-between" mb="xs">
            <Text fw={600}>
              Reconciliation: <Text span ff="monospace" fw={600}>{selected.account.label}</Text>
            </Text>
            <Button size="xs" variant="subtle" onClick={() => select(null)}>Close</Button>
          </Group>
          <ReconPanel accountId={selected.account.accountId} readingError={selected.treasury?.lastReadingError ?? null} />
        </Card>
      )}

      <RewardsPanel />

      <Card withBorder p="sm">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>
            Transfers{selected ? <>: <Text span ff="monospace" fw={600}>{selected.account.label}</Text></> : ' (every account)'}
          </Text>
          <Group gap="xs">
            <Select size="xs" w={150} placeholder="Every kind" clearable value={kindFilter}
              data={TRANSFER_KINDS.map((k) => ({ value: k, label: k }))}
              onChange={(v) => setKindFilter(v as TransferKind | null)} />
            <Select size="xs" w={170} placeholder="Every program" clearable value={programFilter}
              data={TRANSFER_PROGRAMS.map((p) => ({ value: p, label: programLabel(p) }))}
              onChange={(v) => setProgramFilter(v as TransferProgram | null)} />
            {selected && <Button size="xs" variant="subtle" onClick={() => select(null)}>Show every account</Button>}
          </Group>
        </Group>
        <TransfersTable rows={transfers.data ?? []} loading={transfers.isLoading} showAccount={!selected} />
      </Card>

      <RegisterAccountModal opened={registerOpen} onClose={() => setRegisterOpen(false)} onCreated={refresh} />
      <RegisterAccountModal opened={credentialsFor !== null} account={credentialsFor?.account}
        onClose={() => setCredentialsFor(null)} onCreated={refresh} />
      <DeleteSecretsModal row={deleteSecretsFor} onClose={() => setDeleteSecretsFor(null)} />
      <AccountStatusModal target={statusTarget} onClose={() => setStatusTarget(null)} onChanged={refresh} />
      <RecordTransferModal
        accountId={transferFor}
        accounts={accounts.data ?? []}
        onClose={() => setTransferFor(undefined)}
        onRecorded={() => queryClient.invalidateQueries({ queryKey: keys.treasury })}
      />
      <AccountSettingsModal row={settingsFor} onClose={() => setSettingsFor(null)} onSaved={refresh} />
      <ManualSnapshotModal row={snapshotFor} onClose={() => setSnapshotFor(null)} onRecorded={refresh} />
      <ReasonConfirmModal
        opened={emergencyFor !== null}
        onClose={() => setEmergencyFor(null)}
        title={`Emergency cancel ${emergencyFor?.account.label ?? ''}`}
        message={`Cancels every open order on ${emergencyFor?.account.label ?? 'this account'} straight on the venue, around the order gateway: every strategy's, whatever the gateway is doing. For when the gateway is broken or hung. Halt the account too, or a running gateway may place new orders.`}
        confirmLabel="Cancel every order"
        reasonDescription="Required; on the EMERGENCY_CANCEL alert"
        onConfirm={confirmEmergencyCancel}
      />
      <ReasonConfirmModal
        opened={accountHalt?.halt === true}
        onClose={() => setAccountHalt(null)}
        title={`Halt ${accountHalt?.row.account.label ?? ''}`}
        message={`The order gateway cancels every open order on ${accountHalt?.row.account.label ?? 'this account'}, whichever strategy's, and blocks new ones until the account is resumed. Live only; positions are left as they are.`}
        confirmLabel="Halt account"
        onConfirm={confirmAccountHalt}
      />
      <ReasonConfirmModal
        opened={accountHalt?.halt === false}
        onClose={() => setAccountHalt(null)}
        title={`Resume ${accountHalt?.row.account.label ?? ''}`}
        message="Orders may go out on this account again. Global, venue, strategy, session and listing kill switches still apply."
        confirmLabel="Resume account"
        confirmColor="green"
        onConfirm={confirmAccountHalt}
      />
      <ReasonConfirmModal
        opened={haltTarget?.halt === true}
        onClose={() => setHaltTarget(null)}
        title={`Halt ${haltTarget?.venue.name ?? ''}`}
        message={`Every strategy's open orders on ${haltTarget?.venue.name ?? 'this venue'} are cancelled and new ones blocked, in paper and live, until the venue is resumed. Positions are left as they are.`}
        confirmLabel="Halt venue"
        onConfirm={confirmHalt}
      />
      <ReasonConfirmModal
        opened={haltTarget?.halt === false}
        onClose={() => setHaltTarget(null)}
        title={`Resume ${haltTarget?.venue.name ?? ''}`}
        message="Strategies may trade on this venue again. Global, strategy, session and listing kill switches still apply."
        confirmLabel="Resume venue"
        confirmColor="green"
        onConfirm={confirmHalt}
      />
    </Container>
  );
}

export default Treasury;
