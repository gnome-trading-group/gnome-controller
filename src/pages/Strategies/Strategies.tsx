import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconEdit, IconEye, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { Strategy, StrategyStatus } from '../../types';
import { registryApi } from '../../utils/api';

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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Strategy | null>(null);
  const [createForm, setCreateForm] = useState({
    strategyId: 0,
    name: '',
    description: '',
    status: StrategyStatus.INACTIVE,
    parameters: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);

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

  const handleCreate = async () => {
    setCreateError(null);
    try {
      let parameters: Record<string, unknown> | undefined;
      if (createForm.parameters.trim()) {
        parameters = JSON.parse(createForm.parameters);
      }
      await registryApi.createStrategy({
        strategyId: createForm.strategyId,
        name: createForm.name,
        description: createForm.description || undefined,
        status: createForm.status,
        parameters,
      });
      setCreateModalOpen(false);
      setCreateForm({ strategyId: 0, name: '', description: '', status: StrategyStatus.INACTIVE, parameters: '' });
      refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create strategy');
    }
  };

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
      enableEditing: false,
      size: 60,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => { row.original.name = e.target.value; }}
        />
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: true,
      enableEditing: true,
      Cell: ({ row }: { row: MRT_Row<Strategy> }) => (
        <Badge color={STATUS_COLORS[row.original.status]} variant="light">
          {STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
      Edit: ({ cell, row }) => (
        <Select
          defaultValue={cell.getValue<number>().toString()}
          data={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onChange={(value) => { row.original.status = parseInt(value ?? '0'); }}
        />
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => { row.original.description = e.target.value; }}
        />
      ),
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      enableEditing: false,
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
    enableEditing: true,
    editDisplayMode: 'row' as const,
    positionActionsColumn: 'last' as const,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { sorting: [{ id: 'strategyId', desc: false }], density: 'xs' },
    onEditingRowSave: async ({ row, table: t }: { row: MRT_Row<Strategy>; table: MRT_TableInstance<Strategy> }) => {
      await registryApi.updateStrategy(row.original.strategyId, row.original);
      t.setEditingRow(null);
      refresh();
    },
    renderRowActions: ({ row, table: t }: { row: MRT_Row<Strategy>; table: MRT_TableInstance<Strategy> }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <ActionIcon variant="subtle" color="teal" onClick={() => navigate(`/strategies/${row.original.strategyId}`)}>
          <IconEye size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" color="blue" onClick={() => t.setEditingRow(row)}>
          <IconEdit size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" color="red" onClick={() => { setDeleteTarget(row.original); setDeleteModalOpen(true); }}>
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
            <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setCreateModalOpen(true)}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />

      <Modal opened={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create Strategy" size="md">
        <Stack>
          <NumberInput
            label="Strategy ID"
            description="Must be unique — assigned manually"
            value={createForm.strategyId}
            onChange={(v) => setCreateForm((f) => ({ ...f, strategyId: Number(v) }))}
            required
          />
          <TextInput
            label="Name"
            value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <TextInput
            label="Description"
            value={createForm.description}
            onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
          />
          <Select
            label="Status"
            value={createForm.status.toString()}
            data={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(v) => setCreateForm((f) => ({ ...f, status: parseInt(v ?? '0') }))}
          />
          <Textarea
            label="Parameters (JSON)"
            placeholder='{"key": "value"}'
            value={createForm.parameters}
            onChange={(e) => setCreateForm((f) => ({ ...f, parameters: e.target.value }))}
            autosize
            minRows={3}
          />
          {createError && <Text c="red" size="sm">{createError}</Text>}
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </Group>
        </Stack>
      </Modal>

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
