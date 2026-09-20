import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconEdit, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { Strategy, StrategyStatus } from '../../types';
import { registryApi } from '../../utils/api';
import { navigateRowProps } from '../../utils/navigation';
import StrategyFormModal from './StrategyFormModal';

const STATUS_LABELS: Record<number, string> = {
  [StrategyStatus.INACTIVE]: 'Inactive',
  [StrategyStatus.ACTIVE]: 'Active',
  [StrategyStatus.PAUSED]: 'Paused',
};

const STATUS_COLORS: Record<number, string> = {
  [StrategyStatus.INACTIVE]: 'gray',
  [StrategyStatus.ACTIVE]: 'green',
  [StrategyStatus.PAUSED]: 'yellow',
};

function Strategies() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Strategy | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Strategy | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await registryApi.listStrategies();
      setStrategies(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await registryApi.deleteStrategy(deleteTarget.strategyId);
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      console.error('Failed to delete strategy:', e);
    }
  };

  const columns = useMemo<MRT_ColumnDef<Strategy>[]>(() => [
    {
      accessorKey: 'strategyId',
      header: 'ID',
      enableSorting: true,
      size: 60,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Strategy> }) => (
        <Badge color={STATUS_COLORS[row.original.status]} variant="light">
          {STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Strategy> }) =>
        row.original.dateCreated
          ? <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
          : '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: strategies,
    state: { isLoading: loading },
    enableRowActions: true,
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    positionActionsColumn: 'last' as const,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/strategies/${row.original.strategyId}`),
    initialState: { sorting: [{ id: 'strategyId', desc: false }], density: 'xs' },
    renderRowActions: ({ row }: { row: MRT_Row<Strategy> }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <ActionIcon variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); setEditTarget(row.original); setModalOpen(true); }}>
          <IconEdit size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row.original); setDeleteModalOpen(true); }}>
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Strategies</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Create Strategy" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="blue" onClick={() => { setEditTarget(null); setModalOpen(true); }}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />

      <StrategyFormModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
        strategy={editTarget}
      />

      <Modal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Confirm Delete" size="sm">
        <Stack>
          <Text>Delete strategy <Text span fw={500}>{deleteTarget?.name}</Text>?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button color="red" onClick={handleDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default Strategies;
