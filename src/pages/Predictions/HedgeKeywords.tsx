import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Container,
  Group,
  Modal,
  Stack,
  Text,
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
import { errorMessage } from '../../utils/kill-switch';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import { useUrlTableState } from '../../hooks/useUrlTableState';
import CreateHedgeKeywordModal from './CreateHedgeKeywordModal';

function HedgeKeywords() {
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<HedgeKeyword | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const urlState = useUrlTableState({ defaultSort: { id: 'dateCreated', desc: true } });

  const {
    data: keywords,
    total,
    isLoading,
    error,
    pagination,
    sorting,
    setPagination,
    setSorting,
    refresh,
  } = useServerPaginatedTable<HedgeKeyword>({
    fetchFn: registryApi.listHedgeKeywordsPaginated,
    countFn: registryApi.countHedgeKeywords,
    defaultPageSize: 50,
    controlledState: {
      pagination: urlState.pagination,
      sorting: urlState.sorting,
      globalFilter: urlState.globalFilter,
      setPagination: urlState.setPagination,
      setSorting: urlState.setSorting,
      setGlobalFilter: urlState.setGlobalFilter,
    },
  });

  const requestDelete = (keyword: HedgeKeyword) => {
    setDeleteError(null);
    setDeleteTarget(keyword);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await registryApi.deleteHedgeKeyword(deleteTarget.hedgeKeywordId);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      setDeleteError(errorMessage(err, 'Failed to delete hedge keyword'));
    } finally {
      setDeletePending(false);
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
      density: 'xs',
    },
    renderRowActions: ({ row }: { row: MRT_Row<HedgeKeyword> }) => (
      <Tooltip label="Delete" position="left" withArrow openDelay={500}>
        <ActionIcon variant="subtle" color="red" onClick={e => { e.stopPropagation(); requestDelete(row.original); }}>
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

      {error && <Alert color="red" title="Error" mb="md">{error}</Alert>}

      <MantineReactTable table={table} />

      <CreateHedgeKeywordModal opened={createOpened} onClose={closeCreate} onCreated={refresh} />

      <Modal
        opened={deleteTarget !== null}
        onClose={() => { if (deletePending) return; setDeleteTarget(null); }}
        title="Delete Hedge Keyword"
        size="sm"
      >
        <Stack>
          <Text>Are you sure you want to delete this hedge keyword?</Text>
          {deleteTarget && (
            <Text fw={500}>
              {deleteTarget.keyword} ({deleteTarget.securitySymbol ?? `#${deleteTarget.securityId}`})
            </Text>
          )}
          {deleteError && <Text c="red" size="sm">{deleteError}</Text>}
          <Group justify="flex-end">
            <Button variant="default" disabled={deletePending} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" loading={deletePending} onClick={confirmDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default HedgeKeywords;
