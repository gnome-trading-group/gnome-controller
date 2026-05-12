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
import { Security, SecurityType } from '../../types';
import { registryApi } from '../../utils/api';
import { formatSecurityType } from '../../utils/security-master';

interface SecuritiesTabProps {
  onDelete: (type: 'security', id: number, name: string) => void;
}

function SecuritiesTab({ onDelete }: SecuritiesTabProps) {
  const { securities, loading, refreshSecurities } = useGlobalState();

  const [createSecurityOpen, setCreateSecurityOpen] = useState(false);
  const [newSecurityForm, setNewSecurityForm] = useState({
    symbol: '',
    type: SecurityType.SPOT,
    description: '',
  });

  const handleCreateSecurity = async () => {
    try {
      await registryApi.createSecurity(newSecurityForm);
      await refreshSecurities();
      setCreateSecurityOpen(false);
      setNewSecurityForm({ symbol: '', type: SecurityType.SPOT, description: '' });
    } catch (err) {
      console.error('Failed to create security:', err);
    }
  };

  const columns = useMemo<MRT_ColumnDef<Security>[]>(() => [
    {
      accessorKey: 'securityId',
      header: 'ID',
      enableSorting: true,
      enableEditing: false,
      size: 60,
    },
    {
      accessorKey: 'symbol',
      header: 'Symbol',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => {
            row.original.symbol = e.target.value;
          }}
        />
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <Select
          defaultValue={cell.getValue<number>().toString()}
          data={Object.entries(SecurityType)
            .filter(([key]) => isNaN(Number(key)))
            .map(([, value]) => ({
              value: value.toString(),
              label: formatSecurityType(value as number),
            }))}
          onChange={(value) => {
            row.original.type = parseInt(value || '0');
          }}
        />
      ),
      Cell: ({ row }: { row: MRT_Row<Security> }) => formatSecurityType(row.original.type),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => {
            row.original.description = e.target.value;
          }}
        />
      ),
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<Security> }) =>
        row.original.dateCreated ?
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" /> :
          '-',
    },
    {
      accessorKey: 'dateModified',
      header: 'Modified',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<Security> }) =>
        row.original.dateModified ?
          <ReactTimeAgo date={new Date(row.original.dateModified)} timeStyle="round" /> :
          '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: securities,
    state: { isLoading: loading.securities },
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
      sorting: [{ id: 'securityId', desc: false }],
      density: 'xs',
    },
    renderRowActions: ({ row, table: t }: { row: MRT_Row<Security>; table: MRT_TableInstance<Security> }) => (
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
          onClick={() => onDelete('security', row.original.securityId, row.original.symbol)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
    onEditingRowSave: async ({ row, table: t }: { row: MRT_Row<Security>; table: MRT_TableInstance<Security> }) => {
      await registryApi.updateSecurity(row.original.securityId, row.original);
      t.setEditingRow(null);
      refreshSecurities();
    },
    renderTopToolbarCustomActions: () => (
      <Tooltip label="Add Security" position="bottom" withArrow openDelay={500}>
        <ActionIcon
          size="lg"
          variant="filled"
          color="green"
          onClick={() => setCreateSecurityOpen(true)}
        >
          <IconPlus size={20} />
        </ActionIcon>
      </Tooltip>
    ),
  });

  return (
    <>
      <Modal
        opened={createSecurityOpen}
        onClose={() => setCreateSecurityOpen(false)}
        title="Create Security"
        size="sm"
      >
        <Stack>
          <TextInput
            label="Symbol"
            value={newSecurityForm.symbol}
            onChange={(e) => setNewSecurityForm(prev => ({ ...prev, symbol: e.target.value }))}
            required
          />
          <Select
            label="Type"
            data={Object.entries(SecurityType)
              .filter(([key]) => isNaN(Number(key)))
              .map(([, value]) => ({
                value: value.toString(),
                label: formatSecurityType(value as number),
              }))}
            value={newSecurityForm.type.toString()}
            onChange={(value) => setNewSecurityForm(prev => ({ ...prev, type: parseInt(value || '0') }))}
            required
          />
          <TextInput
            label="Description"
            value={newSecurityForm.description}
            onChange={(e) => setNewSecurityForm(prev => ({ ...prev, description: e.target.value }))}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCreateSecurityOpen(false)}>Cancel</Button>
            <Button color="green" onClick={handleCreateSecurity}>Create</Button>
          </Group>
        </Stack>
      </Modal>
      <MantineReactTable table={table} />
    </>
  );
}

export default SecuritiesTab;
