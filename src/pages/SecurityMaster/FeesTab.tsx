import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Anchor, Badge, Button, Group, Select, Switch, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { useGlobalState } from '../../context/GlobalStateContext';
import { FeeScheduleRow, FeeScope } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { describeFeeDefinition, FEE_SCOPE_LABELS, feeScope, feeTarget, supersededFeeSchedules } from '../../utils/fees';
import { AddFeeScheduleModal } from './AddFeeScheduleModal';

// Every fee schedule the registry holds, as recorded: one row per venue change or correction. A listing's resolved
// fees over time are on its own page.
function FeesTab() {
  const { exchanges } = useGlobalState();
  const [exchangeId, setExchangeId] = useState<string | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [rows, setRows] = useState<FeeScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    registryApi.listFeeSchedules({ exchangeId: exchangeId ? Number(exchangeId) : undefined })
      .then(setRows)
      .catch((e) => { setRows([]); setError(errorMessage(e, 'Failed to load fee schedules')); })
      .finally(() => setLoading(false));
  }, [exchangeId]);

  useEffect(load, [load]);

  const exchangeCode = useMemo(() => new Map(exchanges.map((e) => [e.exchangeId, e.exchangeCode])), [exchanges]);
  const superseded = useMemo(() => supersededFeeSchedules(rows), [rows]);
  const shown = useMemo(() => rows.filter((r) =>
    (showSuperseded || !superseded.has(r.feeScheduleId))
    && (!scope || feeScope(r) === scope)
    && (!search.trim() || feeTarget(r).toLowerCase().includes(search.trim().toLowerCase()))),
  [rows, superseded, showSuperseded, scope, search]);

  const columns = useMemo<MRT_ColumnDef<FeeScheduleRow>[]>(() => [
    {
      id: 'exchange', header: 'Exchange', size: 140,
      accessorFn: (r) => exchangeCode.get(r.exchangeId) ?? r.exchangeId,
    },
    {
      id: 'appliesTo', header: 'Applies to', size: 220,
      accessorFn: (r) => `${FEE_SCOPE_LABELS[feeScope(r)]} ${feeTarget(r)}`,
      Cell: ({ row: { original: r } }) => (
        <Group gap={6} wrap="nowrap">
          <Badge size="sm" variant="light">{FEE_SCOPE_LABELS[feeScope(r)]}</Badge>
          {r.listingId !== null
            ? <Anchor component={Link} to={`/security-master/listings/${r.listingId}`} size="sm">{r.listingId}</Anchor>
            : <Text size="sm">{feeTarget(r)}</Text>}
          {superseded.has(r.feeScheduleId) && <Badge size="xs" color="gray">corrected</Badge>}
        </Group>
      ),
    },
    {
      accessorKey: 'effectiveFrom', header: 'Effective from', size: 190,
      Cell: ({ cell }) => <Text size="sm">{new Date(cell.getValue<string>()).toISOString().replace('.000Z', 'Z')}</Text>,
    },
    {
      // A cell rather than an accessor: the table runs accessors on the empty rows it draws as loading skeletons.
      accessorKey: 'definition', header: 'Fees', size: 420, enableSorting: false,
      Cell: ({ row: { original: r } }) => <Text size="sm">{describeFeeDefinition(r.definition)}</Text>,
    },
    {
      accessorKey: 'source', header: 'Source', size: 150,
      Cell: ({ row: { original: r } }) => (
        <Text size="sm" title={r.sourceRef ?? undefined}>{r.source}{r.actor ? ` · ${r.actor}` : ''}</Text>
      ),
    },
    {
      accessorKey: 'recordedAt', header: 'Recorded', size: 120,
      Cell: ({ cell }) => <ReactTimeAgo date={new Date(cell.getValue<string>())} timeStyle="round" />,
    },
  ], [exchangeCode, superseded]);

  const table = useMantineReactTable({
    columns,
    data: shown,
    state: { isLoading: loading },
    enableGlobalFilter: false,
    enableColumnFilters: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 50 } },
    renderTopToolbarCustomActions: () => (
      <Group>
        <Select placeholder="All exchanges" clearable searchable value={exchangeId} onChange={setExchangeId} w={180}
          data={exchanges.map((e) => ({ value: String(e.exchangeId), label: e.exchangeCode }))} />
        <Select placeholder="Any scope" clearable value={scope} onChange={setScope} w={150}
          data={(Object.keys(FEE_SCOPE_LABELS) as FeeScope[]).map((s) => ({ value: s, label: FEE_SCOPE_LABELS[s] }))} />
        <TextInput placeholder="Group, event or listing" value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={210} />
        <Switch label="Show corrected rows" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.currentTarget.checked)} />
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAdding(true)}>Add schedule</Button>
      </Group>
    ),
  });

  return (
    <>
      {error && <Alert color="red" title="Error" mb="md">{error}</Alert>}
      <MantineReactTable table={table} />
      <AddFeeScheduleModal opened={adding} rows={rows} onClose={() => setAdding(false)} onSaved={load} />
    </>
  );
}

export default FeesTab;
