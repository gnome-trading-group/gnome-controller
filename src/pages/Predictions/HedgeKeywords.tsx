import { useMemo } from 'react';
import {
  ActionIcon,
  Anchor,
  Container,
  Group,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { HedgeKeyword } from '../../types';
import { registryApi } from '../../utils/api';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import CreateHedgeKeywordModal from './CreateHedgeKeywordModal';

function HedgeKeywords() {
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);

  const {
    data: keywords,
    total,
    isLoading,
    pagination,
    sorting,
    setPagination,
    setSorting,
    refresh,
  } = useServerPaginatedTable<HedgeKeyword>({
    fetchFn: registryApi.listHedgeKeywordsPaginated,
    countFn: registryApi.countHedgeKeywords,
    defaultPageSize: 50,
  });

  const handleDelete = async (hedgeKeywordId: number) => {
    try {
      await registryApi.deleteHedgeKeyword(hedgeKeywordId);
      refresh();
    } catch (err) {
      console.error('Failed to delete hedge keyword:', err);
    }
  };

  const columns = useMemo<MRT_ColumnDef<HedgeKeyword>[]>(() => [
    {
      accessorKey: 'securitySymbol',
      header: 'Security',
      enableSorting: false,
      Cell: ({ row }) => row.original.securitySymbol ? (
        <Anchor component={Link} to={`/security-master/securities/${row.original.securityId}`} size="sm" onClick={e => e.stopPropagation()}>
          {row.original.securitySymbol}
        </Anchor>
      ) : `#${row.original.securityId}`,
    },
    {
      accessorKey: 'keyword',
      header: 'Keyword',
      enableSorting: true,
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
    data: keywords,
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
      sorting: [{ id: 'dateCreated', desc: true }],
      density: 'xs',
    },
    renderRowActions: ({ row }: { row: MRT_Row<HedgeKeyword> }) => (
      <Tooltip label="Delete" position="left" withArrow openDelay={500}>
        <ActionIcon variant="subtle" color="red" onClick={e => { e.stopPropagation(); handleDelete(row.original.hedgeKeywordId); }}>
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Hedge Keywords</Title>
        <Group>
          <Tooltip label="Add Hedge Keyword" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={openCreate}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh} loading={isLoading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />

      <CreateHedgeKeywordModal opened={createOpened} onClose={closeCreate} onCreated={refresh} />
    </Container>
  );
}

export default HedgeKeywords;
