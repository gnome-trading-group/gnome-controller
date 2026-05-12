import { useState, useMemo } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { useGlobalState } from '../../context/GlobalStateContext';
import { AWS_REGIONS, Exchange, SchemaType } from '../../types';
import { registryApi } from '../../utils/api';

interface ExchangesTabProps {
  onDelete: (type: 'exchange', id: number, name: string) => void;
}

function ExchangesTab({ onDelete }: ExchangesTabProps) {
  const { exchanges, loading, refreshExchanges } = useGlobalState();

  const [createExchangeOpen, setCreateExchangeOpen] = useState(false);
  const [newExchangeForm, setNewExchangeForm] = useState({
    exchangeName: '',
    region: '',
    schemaType: '',
  });

  const handleCreateExchange = async () => {
    try {
      await registryApi.createExchange(newExchangeForm);
      await refreshExchanges();
      setCreateExchangeOpen(false);
      setNewExchangeForm({ exchangeName: '', region: '', schemaType: '' });
    } catch (err) {
      console.error('Failed to create exchange:', err);
    }
  };

  const columns = useMemo<MRT_ColumnDef<Exchange>[]>(() => [
    {
      accessorKey: 'exchangeId',
      header: 'ID',
      enableSorting: true,
      enableEditing: false,
      size: 60,
    },
    {
      accessorKey: 'exchangeName',
      header: 'Name',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => {
            row.original.exchangeName = e.target.value;
          }}
        />
      ),
    },
    {
      accessorKey: 'region',
      header: 'Region',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <Select
          defaultValue={cell.getValue<string>()}
          data={AWS_REGIONS}
          onChange={(value) => {
            row.original.region = value || '';
          }}
        />
      ),
    },
    {
      accessorKey: 'schemaType',
      header: 'Schema Type',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <Select
          defaultValue={cell.getValue<string>()}
          data={Object.values(SchemaType)}
          onChange={(value) => {
            row.original.schemaType = value || '';
          }}
        />
      ),
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<Exchange> }) =>
        row.original.dateCreated ?
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" /> :
          '-',
    },
    {
      accessorKey: 'dateModified',
      header: 'Modified',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<Exchange> }) =>
        row.original.dateModified ?
          <ReactTimeAgo date={new Date(row.original.dateModified)} timeStyle="round" /> :
          '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: exchanges,
    state: { isLoading: loading.exchanges },
    enableRowActions: true,
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    enableEditing: true,
    editDisplayMode: 'row',
    positionActionsColumn: 'last',
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    initialState: {
      sorting: [{ id: 'exchangeId', desc: false }],
      density: 'xs',
    },
    renderRowActions: ({ row, table: t }: { row: MRT_Row<Exchange>; table: MRT_TableInstance<Exchange> }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="blue"
          onClick={() => t.setEditingRow(row)}
        >
          <IconEdit size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={() => onDelete('exchange', row.original.exchangeId, row.original.exchangeName)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
    onEditingRowSave: async ({ row, table: t }: { row: MRT_Row<Exchange>; table: MRT_TableInstance<Exchange> }) => {
      await registryApi.updateExchange(row.original.exchangeId, row.original);
      t.setEditingRow(null);
      refreshExchanges();
    },
    renderTopToolbarCustomActions: () => (
      <Tooltip label="Add Exchange" position="bottom" withArrow openDelay={500}>
        <ActionIcon
          size="lg"
          variant="filled"
          color="green"
          onClick={() => setCreateExchangeOpen(true)}
        >
          <IconPlus size={20} />
        </ActionIcon>
      </Tooltip>
    ),
  });

  return (
    <>
      <Modal
        opened={createExchangeOpen}
        onClose={() => setCreateExchangeOpen(false)}
        title="Create Exchange"
        size="sm"
      >
        <Stack>
          <TextInput
            label="Exchange Name"
            value={newExchangeForm.exchangeName}
            onChange={(e) => setNewExchangeForm(prev => ({ ...prev, exchangeName: e.target.value }))}
            required
          />
          <Select
            label="Region"
            data={AWS_REGIONS}
            value={newExchangeForm.region || null}
            onChange={(value) => setNewExchangeForm(prev => ({ ...prev, region: value || '' }))}
            searchable
            required
          />
          <Select
            label="Schema Type"
            data={Object.values(SchemaType)}
            value={newExchangeForm.schemaType || null}
            onChange={(value) => setNewExchangeForm(prev => ({ ...prev, schemaType: value || '' }))}
            required
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCreateExchangeOpen(false)}>Cancel</Button>
            <Button color="green" onClick={handleCreateExchange}>Create</Button>
          </Group>
        </Stack>
      </Modal>
      <MantineReactTable table={table} />
    </>
  );
}

export default ExchangesTab;
