import { ReactNode, useMemo, useState } from 'react';
import {
  Alert, Anchor, Button, Card, Code, Container, Grid, Group, JsonInput, Stack, Table, Tabs, Text, Timeline,
} from '@mantine/core';
import {
  IconBolt, IconCalendarX, IconCheck, IconExternalLink, IconRefresh, IconRocket, IconRotateClockwise, IconSend, IconX,
} from '@tabler/icons-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LaunchRequestDetail, RequestAction, RequestLink, RequestLinks, ResolvedStrategyConfig } from '../../types/launcher';
import { launcherApi, registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { actorLabel, canCancel, canRetry, isPending, REQUEST_STATUS_COLORS, REQUEST_STATUS_LABELS } from '../../utils/launch-status';
import { SESSION_STATUS_COLORS, stopSummary } from '../../utils/session-status';
import { launcherKeys, LAUNCHER_POLL, useRequest } from '../../query/launcher';
import { isLive, POLL, useSession, useSessionSummary } from '../../query/hooks';
import { PageHeader } from '../../components/PageHeader';
import { LastUpdated } from '../../components/LastUpdated';
import { ContainerLogs } from '../../components/ContainerLogs';
import { Heartbeat } from '../../components/trading/Heartbeat';
import { Kpi, KpiStrip, ModeBadge, ModeBand } from '../../components/trading/layout';
import { Money, Time } from '../../components/trading/values';
import { SessionDetailsPanel } from '../Sessions/SessionDetailsPanel';
import { ActionBadge, ConfirmButton, OutcomeBadge, RequestStatusBadge, SessionStatusBadge, ShortId } from './shared';
import { SimulationSummary } from '../../components/simulation/SimulationSummary';
import { toSessionSimulation } from '../../utils/simulation';
import { usePageTitleLabels } from '../../context/PageTitleContext';

const TABS = ['session', 'logs', 'trigger', 'config'] as const;
type Tab = typeof TABS[number];

interface Step {
  at: string;
  title: ReactNode;
  body?: ReactNode;
  color: string;
}

// The request's own events, the trigger that started it and its session's life, as one sequence.
function steps(request: LaunchRequestDetail, session: ReturnType<typeof useSession>['data']): Step[] {
  const out: Step[] = [];
  const own = request.evaluations.find(e => e.rule_id === request.matched_rule_id);
  const received = own?.received_at ?? request.evaluations[0]?.received_at;
  if (received) {
    out.push({ at: received, color: 'gray', title: 'Trigger received', body: own?.reason ?? undefined });
  }
  for (const event of request.events ?? []) {
    out.push({
      at: event.at,
      color: event.status ? REQUEST_STATUS_COLORS[event.status] ?? 'gray' : 'gray',
      title: <Group gap={6}><Text size="sm" fw={600}>{event.status ? REQUEST_STATUS_LABELS[event.status] : 'Updated'}</Text>
        <Text size="xs" c="dimmed">by {actorLabel(event.actor)}</Text></Group>,
      body: event.note ?? undefined,
    });
  }
  const started = session?.startedAt ?? request.session_started_at;
  const stopped = session?.stoppedAt ?? request.session_stopped_at;
  const status = session?.status ?? request.session_status;
  if (request.session_id && started) {
    out.push({ at: started, color: 'blue', title: 'Session submitted to the registry' });
  }
  if (session?.lastHeartbeatAt && isLive(session)) {
    out.push({ at: session.lastHeartbeatAt, color: SESSION_STATUS_COLORS[session.status] ?? 'green', title: `Session ${session.status.toLowerCase()}`, body: 'last heartbeat' });
  }
  if (stopped) {
    out.push({
      at: stopped, color: status === 'FAILED' ? 'red' : 'gray', title: `Session ${String(status ?? 'ended').toLowerCase()}`,
      body: session?.failureReason ?? request.session_failure_reason
        ?? stopSummary(session ?? { stopReason: request.session_stop_reason ?? null, stoppedBy: request.session_stopped_by ?? null })
        ?? undefined,
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function LaunchDetail() {
  const { requestId = '' } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requestQuery = useRequest(requestId);
  const request = requestQuery.data;
  const heading = request ? `${request.action === 'launch' ? 'Launch' : 'Shutdown'} by ${request.matched_rule_name}` : null;
  usePageTitleLabels([{ segment: requestId, label: heading }]);
  const sessionId = request?.session_id ?? undefined;
  const sessionQuery = useSession(sessionId);
  const session = sessionQuery.data;
  const live = isLive(session);
  const summary = useSessionSummary(sessionId, live);
  const defaultTab: Tab = sessionId ? 'session' : 'trigger';
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? params.get('tab') as Tab : defaultTab;
  const logs = useQuery({
    queryKey: ['sessionLogs', sessionId],
    queryFn: () => registryApi.getSessionLogs(sessionId as string),
    enabled: tab === 'logs' && !!session?.instanceId,
    refetchInterval: live ? POLL.status : false,
  });
  const [busy, setBusy] = useState<RequestAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const timeline = useMemo(() => (request ? steps(request, session) : []), [request, session]);
  const config = request?.resolved_config && 'strategy_id' in request.resolved_config
    ? request.resolved_config as ResolvedStrategyConfig : null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: launcherKeys.request(requestId) });
    if (sessionId) queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
  };
  const act = async (action: RequestAction) => {
    setBusy(action); setActionError(null); setActionNotice(null);
    try {
      const result = await launcherApi.actOnRequest(requestId, action);
      await queryClient.invalidateQueries({ queryKey: launcherKeys.all });
      if (action === 'retry') navigate(`/launcher/requests/${result.request_id}`);
      if (action === 'resend') setActionNotice('Approval message resent to Slack; the old one no longer has buttons.');
    } catch (e) {
      setActionError(errorMessage(e, `Could not ${action} the request`));
    } finally {
      setBusy(null);
    }
  };
  const setTab = (next: string | null) => setParams(cur => {
    const u = new URLSearchParams(cur);
    u.set('tab', next ?? defaultTab);
    return u;
  }, { replace: true });

  const totals = summary.data?.totals;
  const counts = summary.data?.counts;

  return (
    <Container size="xl" py="xl">
      <PageHeader
        onBack={() => navigate(request ? `/launcher/rules/${request.matched_rule_id}` : '/launcher')}
        title={heading ?? 'Launch request'}
        badges={request && (
          <>
            <RequestStatusBadge status={request.status} size="md" />
            <ActionBadge action={request.action} />
            {config && <ModeBadge mode={config.mode} />}
            <LastUpdated at={requestQuery.dataUpdatedAt ? new Date(requestQuery.dataUpdatedAt) : null}
              intervalMs={LAUNCHER_POLL.request} failing={!!requestQuery.error} compact />
          </>
        )}
        actions={request && (
          <>
            {isPending(request) && (
              <>
                <ConfirmButton variant="light" color="gray" label="Reject" icon={<IconX size={16} />} loading={busy === 'reject'}
                  onConfirm={() => act('reject')} />
                <ConfirmButton color="green" label="Approve" icon={<IconCheck size={16} />} loading={busy === 'approve'}
                  onConfirm={() => act('approve')} />
              </>
            )}
            {canCancel(request) && (
              <ConfirmButton variant="light" color="red" label="Cancel launch" icon={<IconCalendarX size={16} />}
                loading={busy === 'cancel'} onConfirm={() => act('cancel')} />
            )}
            {canRetry(request) && (
              <ConfirmButton label="Retry" icon={<IconRotateClockwise size={16} />} loading={busy === 'retry'} onConfirm={() => act('retry')} />
            )}
            {sessionId && (
              <Button variant="default" leftSection={<IconExternalLink size={16} />} component={Link} to={`/sessions/${sessionId}`}>Open session</Button>
            )}
          </>
        )}
        menu={[
          { label: 'Refresh', icon: <IconRefresh size={16} />, onClick: refresh },
          ...(request ? [{ label: 'Open rule', icon: <IconRocket size={16} />, onClick: () => navigate(`/launcher/rules/${request.matched_rule_id}`) }] : []),
          ...(request && isPending(request) ? [{ label: 'Resend to Slack', icon: <IconSend size={16} />, onClick: () => act('resend') }] : []),
        ]}
        meta={request ? [
          <ShortId key="id" id={request.request_id} />,
          <>created <Time value={request.date_created} size="sm" /></>,
          request.rule_revision != null && `rule revision ${request.rule_revision}`,
          request.retry_of && <>retry of <ShortId id={request.retry_of} to={`/launcher/requests/${request.retry_of}`} /></>,
          request.scheduled_time && request.status === 'SCHEDULED' && <>launches at <Time value={request.scheduled_time} size="sm" /></>,
        ] : []}
      />
      {config && <ModeBand mode={config.mode} />}

      {requestQuery.error && <Alert color="red" title="Error" mb="md">{errorMessage(requestQuery.error, 'Failed to load the request')}</Alert>}
      {actionError && <Alert color="red" mb="md" withCloseButton onClose={() => setActionError(null)}>{actionError}</Alert>}
      {actionNotice && <Alert color="green" mb="md" withCloseButton onClose={() => setActionNotice(null)}>{actionNotice}</Alert>}
      {request?.launch_error && <Alert color="red" mb="md" title="Error"><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{request.launch_error}</Text></Alert>}
      {session?.failureReason && <Alert color="red" mb="md" title="The session failed">{session.failureReason}</Alert>}

      {request && (
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card withBorder>
              <Text fw={600} mb="sm">Timeline</Text>
              <Timeline bulletSize={14} lineWidth={2} active={timeline.length - 1}>
                {timeline.map((step, i) => (
                  <Timeline.Item key={i} color={step.color} title={typeof step.title === 'string' ? <Text size="sm" fw={600}>{step.title}</Text> : step.title}>
                    {step.body && <Text size="xs" c="dimmed">{step.body}</Text>}
                    <Time value={step.at} size="xs" c="dimmed" />
                  </Timeline.Item>
                ))}
              </Timeline>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>
            {sessionId && (
              <KpiStrip>
                <Kpi label="Session" value={session ? <SessionStatusBadge status={session.status} /> : <ShortId id={sessionId} />} />
                <Kpi label="Heartbeat" value={session ? <Heartbeat session={session} /> : '—'} />
                <Kpi label="PnL" value={<Money value={totals?.total} arrow />} />
                <Kpi label="Fees" value={<Money value={totals?.fees} pnl={false} />} />
                <Kpi label="Fills" value={counts?.fills ?? '—'} />
                <Kpi label="Open orders" value={counts?.openOrders ?? '—'} />
              </KpiStrip>
            )}
            {request.links && <LinksCard links={request.links} />}
            {request.action === 'shutdown' && (
              <Card withBorder mb="md">
                <Text fw={600} mb="xs">Sessions to stop</Text>
                <Group gap="sm">
                  {(request.target_session_ids ?? []).map(id => <ShortId key={id} id={id} to={`/sessions/${id}`} />)}
                </Group>
              </Card>
            )}
            <Tabs value={tab} onChange={setTab} keepMounted={false}>
              <Tabs.List mb="sm">
                {sessionId && <Tabs.Tab value="session">Session</Tabs.Tab>}
                {sessionId && <Tabs.Tab value="logs">Logs</Tabs.Tab>}
                <Tabs.Tab value="trigger" leftSection={<IconBolt size={14} />}>Trigger</Tabs.Tab>
                {config && <Tabs.Tab value="config">Launch config</Tabs.Tab>}
              </Tabs.List>
              <Tabs.Panel value="session">
                {session ? <SessionDetailsPanel session={session} /> : <Text size="sm" c="dimmed">Loading the session…</Text>}
              </Tabs.Panel>
              <Tabs.Panel value="logs">
                {session?.instanceId ? (
                  <ContainerLogs
                    logs={(logs.data?.logs ?? []).map(l => ({ id: l.instanceId, label: l.instanceId, logs: l.logs, consoleUrl: l.consoleUrl }))}
                    loading={logs.isFetching} initialLoad={logs.isLoading} onRefresh={() => logs.refetch()}
                  />
                ) : <Text size="sm" c="dimmed">No instance yet: logs appear once the session's instance is running.</Text>}
              </Tabs.Panel>
              <Tabs.Panel value="trigger">
                <Stack gap="sm">
                  <Text size="sm" c="dimmed">
                    {request.trigger_id ? <>Trigger <Code>{request.trigger_id}</Code>, and what every rule made of it.</> : 'The trigger this request came from.'}
                  </Text>
                  <JsonInput value={JSON.stringify(request.data, null, 2)} readOnly autosize minRows={3} />
                  {request.evaluations.length > 0 && (
                    <Table striped withTableBorder fz="sm">
                      <Table.Thead><Table.Tr><Table.Th>Rule</Table.Th><Table.Th>Outcome</Table.Th><Table.Th>Why</Table.Th></Table.Tr></Table.Thead>
                      <Table.Tbody>
                        {request.evaluations.map(e => (
                          <Table.Tr key={e.rule_id}>
                            <Table.Td>{e.rule_id === '-' ? <Text size="sm" c="dimmed">trigger</Text>
                              : <Anchor component={Link} to={`/launcher/rules/${e.rule_id}`} size="sm">{e.rule_name}</Anchor>}</Table.Td>
                            <Table.Td><OutcomeBadge outcome={e.outcome} /></Table.Td>
                            <Table.Td>{e.reason}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Stack>
              </Tabs.Panel>
              <Tabs.Panel value="config">
                {config && <LaunchConfig config={config} links={request.links ?? null} />}
              </Tabs.Panel>
            </Tabs>
          </Grid.Col>
        </Grid>
      )}
    </Container>
  );
}

// The launcher writes absolute controller URLs; this stage's own pages open in place, everything else in a new tab.
function LinkAnchor({ link }: { link: RequestLink }) {
  const origin = window.location.origin;
  if (link.url.startsWith(origin + '/')) {
    return <Anchor component={Link} to={link.url.slice(origin.length)} size="sm">{link.label}</Anchor>;
  }
  return (
    <Anchor href={link.url} target="_blank" rel="noopener noreferrer" size="sm">
      <Group gap={4} wrap="nowrap" component="span">{link.label}<IconExternalLink size={12} /></Group>
    </Anchor>
  );
}

function LinksCard({ links }: { links: RequestLinks }) {
  const rows: [string, RequestLink[]][] = [
    ['Strategy', links.strategy ? [links.strategy] : []],
    ['Listings', links.listings],
    ['Pages', links.pages],
  ];
  return (
    <Card withBorder mb="md">
      <Text fw={600} mb={links.titles.length ? 0 : 'xs'}>Links</Text>
      {links.titles.length > 0 && (
        <Stack gap={0} mb="xs">{links.titles.map(title => <Text key={title} size="sm" c="dimmed">{title}</Text>)}</Stack>
      )}
      <Table withRowBorders={false} fz="sm" verticalSpacing={4}>
        <Table.Tbody>
          {rows.filter(([, items]) => items.length > 0).map(([name, items]) => (
            <Table.Tr key={name}>
              <Table.Td c="dimmed" w={120} style={{ verticalAlign: 'top' }}>{name}</Table.Td>
              <Table.Td>
                <Stack gap={2}>{items.map(item => <LinkAnchor key={item.url} link={item} />)}</Stack>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

function LaunchConfig({ config, links }: { config: ResolvedStrategyConfig; links: RequestLinks | null }) {
  const listingLinks = links?.listings.length ? links.listings
    : config.listings.map(id => ({ label: String(id), url: `${window.location.origin}/security-master/listings/${id}` }));
  const rows: [string, ReactNode][] = [
    ['Strategy', links?.strategy ? <LinkAnchor key="s" link={links.strategy} />
      : <Anchor key="s" component={Link} to={`/strategies/${config.strategy_id}`} size="sm">#{config.strategy_id}</Anchor>],
    ['Class', <Code key="c">{config.strategy_class}</Code>],
    ['Listings', <Group key="l" gap="sm">{listingLinks.map(l => <LinkAnchor key={l.url} link={l} />)}</Group>],
    ['Research commit', config.research_commit ? <Code key="r">{config.research_commit.slice(0, 10)}</Code> : 'main'],
    ['Instance type', config.instance_type ?? 'default'],
    ['Latency profile', config.latency_profile ?? 'default'],
    ...Object.entries(config.strategy_args ?? {}).map(([k, v]) => [`arg ${k}`, <Code key={k}>{JSON.stringify(v)}</Code>] as [string, ReactNode]),
  ];
  return (
    <Stack gap="sm">
      <Table withRowBorders={false} fz="sm" verticalSpacing={4}>
        <Table.Tbody>
          {rows.map(([k, v]) => (
            <Table.Tr key={k}>
              <Table.Td c="dimmed" w={200}>{k}</Table.Td>
              <Table.Td style={{ overflowWrap: 'anywhere' }}>{v}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {config.mode === 'paper' && (
        <>
          <Text size="sm" fw={600}>Simulation</Text>
          <SimulationSummary simulation={toSessionSimulation(config.simulation)} />
        </>
      )}
    </Stack>
  );
}

export default LaunchDetail;
