import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Anchor, Badge, Breadcrumbs, Button, Card, Container, Group, SegmentedControl, Stack, Table, Text, Title, Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconHistory, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { useGlobalState } from '../../context/GlobalStateContext';
import { useDayZone } from '../../context/PreferencesContext';
import { usePageTitleLabels } from '../../context/PageTitleContext';
import { useExchangeVolumes, useGatewayStatus, useRiskPolicies } from '../../query/hooks';
import { useModeParam } from '../../hooks/useModeParam';
import { useLatestPolicyHistory } from '../../hooks/useLatestPolicyHistory';
import { RiskPolicy, Volume } from '../../types';
import { findKillSwitch, isKilled, setKillSwitch } from '../../utils/kill-switch';
import { makerPercent } from '../../utils/volume';
import { zoneLabel } from '../../utils/zones';
import { Kpi, KpiStrip, ModeBand, ModeSwitch } from '../../components/trading/layout';
import { Money } from '../../components/trading/values';
import { VolumeKpi } from '../../components/trading/VolumeKpi';
import { DailyBars } from '../../components/trading/DailyBars';
import { ReasonConfirmModal } from '../../components/ReasonConfirmModal';
import { RiskPolicyHistoryModal } from '../../components/RiskPolicyHistoryModal';
import { KillSwitchLatestEntry } from '../../components/KillSwitchLatestEntry';
import FeesTab from './FeesTab';

const WINDOWS: Record<string, number> = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 };

function MakerCell({ volume }: { volume: Volume }) {
  const maker = makerPercent(volume);
  return maker === null ? <Text span c="dimmed" size="sm">—</Text> : <>{maker}%</>;
}

// One exchange: what it is (security master), whether it's halted, and how much we trade there and what that costs.
function ExchangeDetail() {
  const { exchangeId } = useParams<{ exchangeId: string }>();
  const id = Number(exchangeId);
  const navigate = useNavigate();
  const tz = useDayZone();
  const { exchanges } = useGlobalState();
  const exchange = exchanges.find(e => e.exchangeId === id);
  const [mode, setMode] = useModeParam(['live']);
  const [window, setWindow] = useState('30d');
  const [metric, setMetric] = useState<'volume' | 'fees'>('volume');
  const volumes = useExchangeVolumes(mode, tz, WINDOWS[window], id);
  const gateways = useGatewayStatus();
  const policies = useRiskPolicies();
  const [killAction, setKillAction] = useState<'kill' | 'resume' | null>(null);
  const [historyTarget, setHistoryTarget] = useState<RiskPolicy | null>(null);

  const target = useMemo(() => ({ exchangeId: id }), [id]);
  const killSwitch = findKillSwitch(policies.data ?? null, target);
  const killed = isKilled(policies.data ?? null, target);
  const latestKill = useLatestPolicyHistory(killSwitch);
  const own = volumes.data?.exchanges[0];
  const ownGateways = (gateways.data ?? []).filter(g => g.exchangeId === id);
  const daily = useMemo(() => volumes.data?.daily && {
    timeZone: volumes.data.scope.timeZone,
    days: volumes.data.daily.map(d => ({ date: d.date, start: d.start, pnl: '0', volume: d.volume })),
  }, [volumes.data]);

  usePageTitleLabels([{ segment: exchangeId, label: exchange?.exchangeName }]);

  if (!exchange) {
    return <Container size="xl" py="xl"><Text>{exchanges.length === 0 ? 'Loading…' : 'Exchange not found.'}</Text></Container>;
  }

  const confirmKill = async (reason: string | undefined) => {
    await setKillSwitch(killSwitch, target, killAction === 'kill', reason);
    await policies.refetch();
  };

  return (
    <Container size="xl" py="xl">
      <Breadcrumbs mb="md">
        <Anchor onClick={() => navigate('/security-master?tab=exchanges')} size="sm">Security Master</Anchor>
        <Text size="sm">{exchange.exchangeName}</Text>
      </Breadcrumbs>

      <Group mb="md" justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{exchange.exchangeName}</Title>
          <Text c="dimmed">
            {exchange.exchangeCode} &mdash; {exchange.region}
            {exchange.homeZoneId ? ` · home zone ${zoneLabel(exchange.homeZoneId)}` : ''}
          </Text>
          <Group gap="xs" mt="xs">
            {ownGateways.map(g => (
              <Badge
                key={g.gatewayKey}
                component={Link}
                to={`/trading/gateways/${encodeURIComponent(g.gatewayKey)}`}
                variant="light"
                color={g.mode === 'live' ? 'green' : 'violet'}
                style={{ cursor: 'pointer', textTransform: 'none' }}
              >
                {g.gatewayKey}
              </Badge>
            ))}
          </Group>
        </div>
        {killed === null ? (
          <Button variant="default" disabled>Kill status unknown</Button>
        ) : (
          <Button
            color={killed ? 'green' : 'red'}
            leftSection={killed ? <IconPlayerPlay size={16} /> : <IconPlayerStop size={16} />}
            onClick={() => setKillAction(killed ? 'resume' : 'kill')}
          >
            {killed ? 'Resume exchange' : 'Kill exchange'}
          </Button>
        )}
      </Group>

      {killed && (
        <Alert mb="md" color="red" title="Exchange killed" icon={<IconAlertTriangle size={20} />}>
          <Group justify="space-between" align="center">
            <Stack gap={4}>
              <Text size="sm">Every strategy's orders on {exchange.exchangeName} are blocked, in paper and live, until it is resumed.</Text>
              <KillSwitchLatestEntry entry={latestKill} enabled />
            </Stack>
            {killSwitch && (
              <Button variant="outline" size="sm" leftSection={<IconHistory size={16} />} onClick={() => setHistoryTarget(killSwitch)}>
                History
              </Button>
            )}
          </Group>
        </Alert>
      )}

      <Group justify="space-between" mb="xs">
        <Title order={4}>Trading</Title>
        <Group gap="xs">
          <SegmentedControl size="xs" value={window} onChange={setWindow} data={Object.keys(WINDOWS)} />
          <ModeSwitch mode={mode} onChange={setMode} size="xs" />
        </Group>
      </Group>
      <ModeBand mode={mode} />
      {volumes.error && <Alert mb="md" color="red" title="Error">{String(volumes.error)}</Alert>}

      <KpiStrip>
        <VolumeKpi label={`Volume (${window})`} volume={own?.volume} />
        <Kpi
          label={mode === 'live' ? 'Rewards & rebates' : 'Rewards (est.)'}
          hint={mode === 'live'
            ? 'What the exchange paid our accounts for trading there: liquidity rewards and maker or taker rebates'
            : "The paper sessions' estimates of the liquidity rewards their resting orders earned"}
          value={<Money value={own?.rewards} />}
        />
        <Kpi
          label="Net cost / $100"
          hint="Fees less rewards and rebates, per $100 traded. Negative when the exchange paid more than it charged."
          value={<Money value={own?.netCostPer100 ?? undefined} pnl={false} />}
        />
      </KpiStrip>

      <Card withBorder mb="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Daily {metric} ({volumes.data?.scope.timeZone ?? tz})</Text>
          <SegmentedControl
            size="xs"
            value={metric}
            onChange={v => setMetric(v as 'volume' | 'fees')}
            data={[{ value: 'volume', label: 'Volume' }, { value: 'fees', label: 'Fees' }]}
          />
        </Group>
        <DailyBars daily={daily} loading={volumes.isLoading} refreshing={volumes.isPlaceholderData} metric={metric} />
      </Card>

      <Card withBorder mb="md">
        <Text fw={600} mb="xs">Accounts</Text>
        {mode === 'paper' ? (
          <Text size="sm" c="dimmed">Paper trades through no venue account.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Account</Table.Th>
                <Table.Th ta="right">Volume</Table.Th>
                <Table.Th ta="right">Maker</Table.Th>
                <Table.Th ta="right">Fills</Table.Th>
                <Table.Th ta="right">Fees</Table.Th>
                <Table.Th ta="right">Rewards</Table.Th>
                <Table.Th>Fee tier</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(own?.accounts ?? []).map(a => (
                <Table.Tr key={a.accountId}>
                  <Table.Td>
                    <Anchor component={Link} to="/treasury" size="sm">{a.label ?? `account ${a.accountId}`}</Anchor>
                  </Table.Td>
                  <Table.Td ta="right"><Money value={a.volume.notional} pnl={false} size="sm" /></Table.Td>
                  <Table.Td ta="right"><MakerCell volume={a.volume} /></Table.Td>
                  <Table.Td ta="right">{a.volume.fills.toLocaleString()}</Table.Td>
                  <Table.Td ta="right"><Money value={a.volume.fees} pnl={false} size="sm" /></Table.Td>
                  <Table.Td ta="right"><Money value={a.rewards} size="sm" /></Table.Td>
                  <Table.Td>
                    <Tooltip label="Fee tiers aren't tracked yet" withArrow openDelay={200}>
                      <Text span c="dimmed" size="sm">—</Text>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
              {own && own.accounts.length === 0 && (
                <Table.Tr><Table.Td colSpan={7}><Text size="sm" c="dimmed">No account traded or was rewarded in this window.</Text></Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Card withBorder mb="md">
        <Text fw={600} mb="xs">Strategies</Text>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Strategy</Table.Th>
              <Table.Th ta="right">Volume</Table.Th>
              <Table.Th ta="right">Maker</Table.Th>
              <Table.Th ta="right">Fills</Table.Th>
              <Table.Th ta="right">Fees</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(own?.strategies ?? []).map(s => (
              <Table.Tr key={s.strategyId}>
                <Table.Td>
                  <Anchor component={Link} to={`/strategies/${s.strategyId}?mode=${mode}`} size="sm">{s.name ?? s.strategyId}</Anchor>
                </Table.Td>
                <Table.Td ta="right"><Money value={s.volume.notional} pnl={false} size="sm" /></Table.Td>
                <Table.Td ta="right"><MakerCell volume={s.volume} /></Table.Td>
                <Table.Td ta="right">{s.volume.fills.toLocaleString()}</Table.Td>
                <Table.Td ta="right"><Money value={s.volume.fees} pnl={false} size="sm" /></Table.Td>
              </Table.Tr>
            ))}
            {own && own.strategies.length === 0 && (
              <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">Nothing traded in this window.</Text></Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <Title order={4} mb="xs">Fee schedules</Title>
      <FeesTab fixedExchangeId={id} />

      <ReasonConfirmModal
        opened={killAction === 'kill'}
        onClose={() => setKillAction(null)}
        title="Kill Exchange"
        message={`Every strategy's open orders on ${exchange.exchangeName} are cancelled and new ones blocked, in paper and live, until it is resumed. Positions are left as they are. Are you sure?`}
        confirmLabel="Kill exchange"
        onConfirm={confirmKill}
      />
      <ReasonConfirmModal
        opened={killAction === 'resume'}
        onClose={() => setKillAction(null)}
        title="Resume Exchange"
        message={`Strategies may trade on ${exchange.exchangeName} again. Global, strategy, session and listing kill switches still apply.`}
        confirmLabel="Resume exchange"
        confirmColor="green"
        onConfirm={confirmKill}
      />
      <RiskPolicyHistoryModal policy={historyTarget} onClose={() => setHistoryTarget(null)} />
    </Container>
  );
}

export default ExchangeDetail;
