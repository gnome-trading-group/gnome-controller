import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Select, Stack, Switch, Text, Textarea } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import ReactTimeAgo from 'react-time-ago';
import { useGlobalState } from '../../context/GlobalStateContext';
import { registryApi } from '../../utils/api';
import { keys } from '../../query/hooks';
import { errorMessage } from '../../utils/kill-switch';
import {
  blocksProblem, describeLatency, describeQueue, SimulationBlocks, SimulationParametersRow,
} from '../../utils/simulation';
import { SimulationBlocksForm } from '../../components/simulation/SimulationBlocksForm';

const RECORDED_BLOCKS = ['network_latency', 'order_processing_latency', 'market_data_latency', 'queue_model', 'self_trade_prevention'] as const;

// Each exchange's simulation parameters: how paper sessions and backtests simulate its listings unless a run overrides
// them. Rows are append-only versions; a run reads the version in force when it launched, so recording new
// parameters never changes a run already made.
function SimulationTab() {
  const { exchanges } = useGlobalState();
  const queryClient = useQueryClient();
  const [history, setHistory] = useState(false);
  const [recording, setRecording] = useState<number | null | 'new'>(null);
  const rows = useQuery({
    queryKey: keys.simulationParameterRows(history),
    queryFn: () => registryApi.listSimulationParameters({ history }),
  });
  const code = useMemo(() => new Map(exchanges.map(e => [e.exchangeId, e.exchangeCode])), [exchanges]);
  const unrecorded = exchanges.filter(e => !history && rows.data && !rows.data.some(r => r.exchange_id === e.exchangeId));

  const columns = useMemo<MRT_ColumnDef<SimulationParametersRow>[]>(() => [
    { id: 'exchange', header: 'Exchange', size: 140, accessorFn: r => code.get(r.exchange_id) ?? r.exchange_id },
    {
      id: 'network', header: 'Network latency', size: 230,
      Cell: ({ row: { original: r } }) => <Text size="sm">{describeLatency(r.definition.network_latency)}</Text>,
    },
    {
      id: 'order', header: 'Order latency', size: 260,
      Cell: ({ row: { original: r } }) => <Text size="sm">{describeLatency(r.definition.order_processing_latency)}</Text>,
    },
    {
      id: 'marketData', header: 'Market data (backtests)', size: 230,
      Cell: ({ row: { original: r } }) => <Text size="sm">{describeLatency(r.definition.market_data_latency)}</Text>,
    },
    {
      id: 'queue', header: 'Queue · self-trade', size: 220,
      Cell: ({ row: { original: r } }) => (
        <Text size="sm">{describeQueue(r.definition.queue_model)} · {r.definition.self_trade_prevention.toLowerCase().replace('_', ' ')}</Text>
      ),
    },
    {
      id: 'note', header: 'Note', size: 240,
      Cell: ({ row: { original: r } }) => <Text size="sm" c="dimmed" lineClamp={2} title={r.note ?? undefined}>{r.note ?? ''}</Text>,
    },
    {
      accessorKey: 'recorded_at', header: 'Recorded', size: 150,
      Cell: ({ row: { original: r } }) => (
        <Text size="sm" title={new Date(r.recorded_at).toISOString()}>
          <ReactTimeAgo date={new Date(r.recorded_at)} timeStyle="round" />{r.actor ? ` · ${r.actor.replace(/^ui:/, '')}` : ''}
        </Text>
      ),
    },
  ], [code]);

  const table = useMantineReactTable({
    columns,
    data: rows.data ?? [],
    state: { isLoading: rows.isLoading },
    enableGlobalFilter: false,
    enableColumnFilters: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 50 } },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => setRecording(row.original.exchange_id), style: { cursor: 'pointer' },
    }),
    renderTopToolbarCustomActions: () => (
      <Group>
        <Switch label="Every version" checked={history} onChange={e => setHistory(e.currentTarget.checked)} />
        <Button leftSection={<IconPlus size={16} />} onClick={() => setRecording('new')}>Record parameters</Button>
      </Group>
    ),
  });

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        How each exchange behaves in simulation. Paper sessions and backtests use these for every listing on the exchange
        unless the run overrides a block; fees come from the fee schedules. A run reads the version in force when it
        launched, so recording new parameters changes only runs launched afterwards. Click a row to record a new version.
      </Text>
      {rows.error && <Alert color="red" title="Error">{errorMessage(rows.error, 'Failed to load simulation parameters')}</Alert>}
      {unrecorded.length > 0 && (
        <Alert color="yellow" title="Exchanges without simulation parameters">
          <Group gap={6}>
            {unrecorded.map(e => <Badge key={e.exchangeId} variant="light" color="yellow">{e.exchangeCode}</Badge>)}
            <Text size="sm">Paper sessions on these are refused unless they override every block.</Text>
          </Group>
        </Alert>
      )}
      <MantineReactTable table={table} />
      <RecordParametersModal
        exchangeId={recording === 'new' ? null : recording}
        opened={recording !== null}
        onClose={() => setRecording(null)}
        onSaved={() => { setRecording(null); queryClient.invalidateQueries({ queryKey: ['simulationParameters'] }); }}
      />
    </Stack>
  );
}

// A new version of an exchange's parameters, starting from the one in force.
function RecordParametersModal({ exchangeId, opened, onClose, onSaved }: {
  exchangeId: number | null;
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { exchanges } = useGlobalState();
  const [chosen, setChosen] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<SimulationBlocks>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = exchangeId ?? (chosen ? Number(chosen) : null);

  const current = useQuery({
    queryKey: keys.simulationParametersOf(target),
    queryFn: async () => (await registryApi.listSimulationParameters({ exchangeId: target! }))[0] ?? null,
    enabled: opened && target !== null,
  });
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  if (opened && target !== null && current.isSuccess && loadedFor !== target) {
    setLoadedFor(target);
    setBlocks(current.data?.definition ?? {});
  }
  const reset = () => { setChosen(null); setBlocks({}); setNote(''); setError(null); setLoadedFor(null); };

  const missing = RECORDED_BLOCKS.filter(k => blocks[k] === undefined);
  const save = async () => {
    setError(null);
    if (target === null) { setError('Choose an exchange'); return; }
    if (missing.length) { setError(`Every block is needed: ${missing.join(', ').replace(/_/g, ' ')}`); return; }
    const problem = blocksProblem('Parameters', blocks);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      await registryApi.recordSimulationParameters({
        exchangeId: target, definition: blocks as SimulationParametersRow['definition'], note: note.trim() || undefined,
      });
      reset();
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Could not record the parameters'));
    } finally {
      setSaving(false);
    }
  };

  const exchangeName = exchanges.find(e => e.exchangeId === target)?.exchangeCode;
  return (
    <Modal opened={opened} onClose={() => { reset(); onClose(); }} size="lg"
      title={exchangeId !== null ? `Record ${exchangeName} parameters` : 'Record simulation parameters'}>
      <Stack gap="sm">
        {exchangeId === null && (
          <Select label="Exchange" required searchable value={chosen} onChange={v => { setChosen(v); setLoadedFor(null); }}
            data={exchanges.map(e => ({ value: String(e.exchangeId), label: e.exchangeCode }))} />
        )}
        {target !== null && (
          <>
            <Text size="xs" c="dimmed">
              {current.data ? 'Starts from the version in force.' : 'No version recorded yet.'} Runs already launched keep
              the version they read.
            </Text>
            <SimulationBlocksForm value={blocks} onChange={setBlocks} showMarketData showFees={false} />
            <Textarea label="Note" placeholder="Where these numbers come from" autosize minRows={2}
              value={note} onChange={e => setNote(e.currentTarget.value)} />
          </>
        )}
        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button loading={saving} onClick={save} disabled={target === null}>Record</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default SimulationTab;
