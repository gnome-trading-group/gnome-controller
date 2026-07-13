import { useState, useEffect, useMemo } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
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
import { IconCheck, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_RowSelectionState } from 'mantine-react-table';
import { ContractRelationship, ContractRelationshipType } from '../../types';
import { registryApi } from '../../utils/api';
import { useGlobalState } from '../../context/GlobalStateContext';
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
  const [relationships, setRelationships] = useState<ContractRelationship[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'table' | 'graph'>('table');
  const [reviewedFilter, setReviewedFilter] = useState<string>('pending');
  const [methodFilter, setMethodFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const params: { reviewed?: boolean; method?: string; relationshipType?: string } = {};
      if (reviewedFilter === 'pending') params.reviewed = false;
      else if (reviewedFilter === 'reviewed') params.reviewed = true;
      if (methodFilter) params.method = methodFilter;
      if (typeFilter) params.relationshipType = typeFilter;

      const result = await registryApi.listContractRelationships(params);
      setRelationships(result as ContractRelationship[]);
    } catch (err) {
      console.error('Failed to fetch relationships:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [reviewedFilter, methodFilter, typeFilter]);

  const handleApprove = async (relationshipId: number) => {
    try {
      await registryApi.reviewContractRelationship(relationshipId, true);
      setRelationships(prev =>
        prev.map(r =>
          r.relationshipId === relationshipId
            ? { ...r, reviewed: true, reviewedAt: new Date().toISOString() }
            : r,
        ),
      );
    } catch (err) {
      console.error('Failed to approve relationship:', err);
    }
  };

  const handleDelete = async (relationshipId: number) => {
    try {
      await registryApi.deleteContractRelationship(relationshipId);
      setRelationships(prev => prev.filter(r => r.relationshipId !== relationshipId));
    } catch (err) {
      console.error('Failed to delete relationship:', err);
    }
  };

  const handleBulkApprove = async () => {
    const ids = Object.keys(rowSelection).map(Number);
    await Promise.all(ids.map(id => registryApi.reviewContractRelationship(id, true)));
    setRelationships(prev =>
      prev.map(r =>
        ids.includes(r.relationshipId)
          ? { ...r, reviewed: true, reviewedAt: new Date().toISOString() }
          : r,
      ),
    );
    setRowSelection({});
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
      enableGrouping: true,
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
      enableGrouping: true,
      size: 100,
    },
    {
      accessorKey: 'reviewed',
      header: 'Status',
      enableSorting: true,
      enableGrouping: true,
      size: 100,
      Cell: ({ row }) => (
        <Badge color={row.original.reviewed ? 'green' : 'yellow'} variant="light" size="sm">
          {row.original.reviewed ? 'Reviewed' : 'Pending'}
        </Badge>
      ),
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

  const selectedCount = Object.keys(rowSelection).length;

  const table = useMantineReactTable({
    columns,
    data: relationships,
    state: { isLoading: loading, rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: row => String(row.relationshipId),
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    enableGrouping: true,
    enableRowActions: true,
    enableRowSelection: true,
    positionActionsColumn: 'last',
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    initialState: {
      sorting: [{ id: 'dateCreated', desc: true }],
      density: 'xs',
    },
    renderRowActions: ({ row }: { row: MRT_Row<ContractRelationship> }) => (
      <Group gap="xs" wrap="nowrap">
        {!row.original.reviewed && (
          <Tooltip label="Approve" position="left" withArrow openDelay={500}>
            <ActionIcon variant="subtle" color="green" onClick={e => { e.stopPropagation(); handleApprove(row.original.relationshipId); }}>
              <IconCheck size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Delete" position="left" withArrow openDelay={500}>
          <ActionIcon variant="subtle" color="red" onClick={e => { e.stopPropagation(); handleDelete(row.original.relationshipId); }}>
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Contract Relationships</Title>
        <Group>
          {selectedCount > 0 && (
            <Button leftSection={<IconCheck size={16} />} color="green" variant="light" onClick={handleBulkApprove}>
              Approve {selectedCount} selected
            </Button>
          )}
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
          <SegmentedControl
            value={reviewedFilter}
            onChange={setReviewedFilter}
            size="sm"
            data={[
              { value: 'pending', label: 'Pending' },
              { value: 'reviewed', label: 'Reviewed' },
              { value: 'all', label: 'All' },
            ]}
          />
          <Tooltip label="Create Manual Relationship" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={openCreate}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={loading}>
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
          {loading ? (
            <Stack align="center" justify="center" style={{ height: '100%' }}>
              <ActionIcon loading size="xl" variant="transparent" />
            </Stack>
          ) : (
            <RelationshipGraph
              relationships={relationships}
              securitySymbols={securitySymbols}
              height="100%"
              onApprove={handleApprove}
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
