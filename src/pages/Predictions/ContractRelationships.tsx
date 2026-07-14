import { useState, useEffect, useRef, useMemo } from 'react';
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
import { useGlobalState } from '../../context/GlobalStateContext';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import RelationshipGraph from './RelationshipGraph';
import CreateRelationshipModal from './CreateRelationshipModal';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  COMPLEMENT: 'teal',
  IMPLIES: 'blue',
  MUTUALLY_EXCLUSIVE: 'orange',
  CORRELATED: 'gray',
  HEDGEABLE_WITH: 'violet',
};

const RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'EQUIVALENT', label: 'Equivalent' },
  { value: 'COMPLEMENT', label: 'Complement' },
  { value: 'IMPLIES', label: 'Implies' },
  { value: 'MUTUALLY_EXCLUSIVE', label: 'Mutually Exclusive' },
  { value: 'CORRELATED', label: 'Correlated' },
  { value: 'HEDGEABLE_WITH', label: 'Hedgeable With' },
];

const METHOD_OPTIONS = [
  { value: 'structural', label: 'Structural' },
  { value: 'embedding', label: 'Embedding' },
  { value: 'rule', label: 'Rule' },
  { value: 'manual', label: 'Manual' },
];

function ContractRelationships() {
  const { securitySymbols } = useGlobalState();
  const [view, setView] = useState<'table' | 'graph'>('table');
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [filterKey, setFilterKey] = useState(0);
  const isFirstFilterRun = useRef(true);

  const extraParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = {};
    if (methodFilter) p.method = methodFilter;
    if (typeFilter) p.relationshipType = typeFilter;
    return p;
  }, [methodFilter, typeFilter]);

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
    externalRefreshKey: filterKey,
  });

  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
    setFilterKey(k => k + 1);
  }, [methodFilter, typeFilter]);

  const handleDelete = async (relationshipId: number) => {
    try {
      await registryApi.deleteContractRelationship(relationshipId);
      refresh();
    } catch (err) {
      console.error('Failed to delete relationship:', err);
    }
  };

  const columns = useMemo<MRT_ColumnDef<ContractRelationship>[]>(() => [
    {
      accessorKey: 'securityIdA',
      header: 'Security A',
      enableSorting: true,
      Cell: ({ row }) => {
        const sym = securitySymbols[row.original.securityIdA] ?? `#${row.original.securityIdA}`;
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
        const sym = securitySymbols[row.original.securityIdB] ?? `#${row.original.securityIdB}`;
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
  ], [securitySymbols]);

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
      sorting: [{ id: 'confidence', desc: true }],
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
            onChange={v => setView(v as 'table' | 'graph')}
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
              securitySymbols={securitySymbols}
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
