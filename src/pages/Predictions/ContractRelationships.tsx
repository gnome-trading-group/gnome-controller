import { useMemo } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Container,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { ContractRelationship, ContractRelationshipType } from '../../types';
import { registryApi } from '../../utils/api';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import { useUrlTableState } from '../../hooks/useUrlTableState';
import RelationshipGraph from './RelationshipGraph';
import CreateRelationshipModal from './CreateRelationshipModal';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  COMPLEMENT: 'teal',
  IMPLIES: 'blue',
  MUTUALLY_EXCLUSIVE: 'orange',

  HEDGEABLE_WITH: 'violet',
};

const RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'EQUIVALENT', label: 'Equivalent' },
  { value: 'COMPLEMENT', label: 'Complement' },
  { value: 'IMPLIES', label: 'Implies' },
  { value: 'MUTUALLY_EXCLUSIVE', label: 'Mutually Exclusive' },

  { value: 'HEDGEABLE_WITH', label: 'Hedgeable With' },
];

const METHOD_OPTIONS = [
  { value: 'structural', label: 'Structural' },
  { value: 'embedding', label: 'Embedding' },
  { value: 'rule', label: 'Rule' },
  { value: 'manual', label: 'Manual' },
];

function ContractRelationships() {
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);

  const urlState = useUrlTableState({ defaultSort: { id: 'confidence', desc: true } });
  const methodFilter = urlState.getParam('method') || null;
  const typeFilter = urlState.getParam('type') || null;
  const showResolved = urlState.getParam('resolved') === 'true';
  const view = (urlState.getParam('view') || 'table') as 'table' | 'graph';

  const setMethodFilter = (v: string | null) => urlState.setParam('method', v ?? '');
  const setTypeFilter = (v: string | null) => urlState.setParam('type', v ?? '');
  const setShowResolved = (v: boolean) => urlState.setParam('resolved', v ? 'true' : '');
  const setView = (v: string) => urlState.setParam('view', v === 'table' ? '' : v);

  const extraParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = {};
    if (methodFilter) p.method = methodFilter;
    if (typeFilter) p.relationshipType = typeFilter;
    if (!showResolved) p.eventResolved = false;
    return p;
  }, [methodFilter, typeFilter, showResolved]);

  const {
    data: relationships,
    total,
    isLoading,
    pagination,
    sorting,
    setPagination,
    setSorting,
    refresh,
  } = useServerPaginatedTable<ContractRelationship>({
    fetchFn: registryApi.listContractRelationshipsPaginated,
    countFn: registryApi.countContractRelationships,
    defaultPageSize: 50,
    extraParams,
    controlledState: {
      pagination: urlState.pagination,
      sorting: urlState.sorting,
      globalFilter: urlState.globalFilter,
      setPagination: urlState.setPagination,
      setSorting: urlState.setSorting,
      setGlobalFilter: urlState.setGlobalFilter,
    },
  });

  const handleDelete = async (relationshipId: number) => {
    try {
      await registryApi.deleteContractRelationship(relationshipId);
      refresh();
    } catch (err) {
      console.error('Failed to delete relationship:', err);
    }
  };

  const symbolMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const r of relationships) {
      if (r.symbolA) map[r.securityIdA] = r.symbolA;
      if (r.symbolB) map[r.securityIdB] = r.symbolB;
    }
    return map;
  }, [relationships]);

  const columns = useMemo<MRT_ColumnDef<ContractRelationship>[]>(() => [
    {
      accessorKey: 'securityIdA',
      header: 'Security A',
      enableSorting: true,
      Cell: ({ row }) => {
        const sym = row.original.symbolA ?? `#${row.original.securityIdA}`;
        return (
          <Anchor component={Link} to={`/security-master/securities/${row.original.securityIdA}`} size="sm" onClick={e => e.stopPropagation()}>
            {sym}
          </Anchor>
        );
      },
    },
    {
      accessorKey: 'securityIdB',
      header: 'Security B',
      enableSorting: true,
      Cell: ({ row }) => {
        const sym = row.original.symbolB ?? `#${row.original.securityIdB}`;
        return (
          <Anchor component={Link} to={`/security-master/securities/${row.original.securityIdB}`} size="sm" onClick={e => e.stopPropagation()}>
            {sym}
          </Anchor>
        );
      },
    },
    {
      accessorKey: 'relationshipType',
      header: 'Type',
      enableSorting: true,
      Cell: ({ row }) => (
        <Badge color={RELATIONSHIP_COLORS[row.original.relationshipType] ?? 'gray'} variant="light" size="sm">
          {row.original.relationshipType.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'confidence',
      header: 'Confidence',
      enableSorting: true,
      size: 100,
      Cell: ({ row }) => `${(row.original.confidence * 100).toFixed(0)}%`,
    },
    {
      accessorKey: 'method',
      header: 'Method',
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }) =>
        row.original.dateCreated ? (
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
        ) : '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: relationships,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: { isLoading, pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    enableGrouping: false,
    enableRowActions: true,
    positionActionsColumn: 'last',
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    initialState: {
      density: 'xs',
    },
    renderRowActions: ({ row }: { row: MRT_Row<ContractRelationship> }) => (
      <Tooltip label="Delete" position="left" withArrow openDelay={500}>
        <ActionIcon variant="subtle" color="red" onClick={e => { e.stopPropagation(); handleDelete(row.original.relationshipId); }}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Contract Relationships</Title>
        <Group>
          <Select
            placeholder="All Methods"
            data={METHOD_OPTIONS}
            value={methodFilter}
            onChange={setMethodFilter}
            clearable
            size="sm"
            style={{ width: 140 }}
          />
          <Select
            placeholder="All Types"
            data={RELATIONSHIP_TYPE_OPTIONS}
            value={typeFilter}
            onChange={setTypeFilter}
            clearable
            size="sm"
            style={{ width: 160 }}
          />
          <Switch
            label="Show Resolved"
            checked={showResolved}
            onChange={e => setShowResolved(e.currentTarget.checked)}
            size="sm"
          />
          <Tooltip label="Create Manual Relationship" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={openCreate}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={isLoading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <SegmentedControl
            value={view}
            onChange={setView}
            size="sm"
            data={[
              { value: 'table', label: 'Table' },
              { value: 'graph', label: 'Graph' },
            ]}
          />
        </Group>
      </Group>

      {view === 'table' ? (
        <MantineReactTable table={table} />
      ) : (
        <Paper withBorder p="xs" style={{ height: 'calc(100vh - 200px)' }}>
          {isLoading ? (
            <Stack align="center" justify="center" style={{ height: '100%' }}>
              <ActionIcon loading size="xl" variant="transparent" />
            </Stack>
          ) : (
            <RelationshipGraph
              relationships={relationships}
              securitySymbols={symbolMap}
              height="100%"
              onDelete={handleDelete}
            />
          )}
        </Paper>
      )}

      <CreateRelationshipModal opened={createOpened} onClose={closeCreate} onCreated={refresh} />
    </Container>
  );
}

export default ContractRelationships;
