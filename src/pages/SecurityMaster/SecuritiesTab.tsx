import React, { useState, useMemo } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { useGlobalState } from '../../context/GlobalStateContext';
import { Security, SecurityType } from '../../types';
import { registryApi } from '../../utils/api';
import { formatAssetClass, formatSecurityType } from '../../utils/security-master';

interface SecuritiesTabProps {
  onDelete: (type: 'security', id: number, name: string) => void;
}

function SecuritiesTab({ onDelete }: SecuritiesTabProps) {
  const { securities, loading, refreshSecurities } = useGlobalState();
  const navigate = useNavigate();

  const [createSecurityOpen, setCreateSecurityOpen] = useState(false);
  const [newSecurityForm, setNewSecurityForm] = useState({
    symbol: '',
    type: SecurityType.SPOT as number,
    description: '',
  });

  const handleCreateSecurity = async () => {
    try {
      await registryApi.createSecurity(newSecurityForm as any);
      await refreshSecurities();
      setCreateSecurityOpen(false);
      setNewSecurityForm({ symbol: '', type: SecurityType.SPOT, description: '' });
    } catch (err) {
      console.error('Failed to create security:', err);
    }
  };

  const columns = useMemo<MRT_ColumnDef<Security>[]>(() => [
    {
      accessorKey: 'symbol',
      header: 'Symbol',
      enableSorting: true,
      enableGrouping: true,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      enableSorting: true,
      enableGrouping: true,
      Cell: ({ row }: { row: MRT_Row<Security> }) => formatSecurityType(row.original.type),
    },
    {
      accessorKey: 'assetClass',
      header: 'Asset Class',
      enableSorting: true,
      enableGrouping: true,
      Cell: ({ row }: { row: MRT_Row<Security> }) => formatAssetClass(row.original.assetClass),
    },
    {
      accessorKey: 'quoteCurrency',
      header: 'Quote Currency',
      enableSorting: true,
      enableGrouping: true,
      Cell: ({ row }: { row: MRT_Row<Security> }) => row.original.quoteCurrency ?? '-',
    },
    {
      accessorKey: 'active',
      header: 'Active',
      enableSorting: true,
      enableGrouping: true,
      size: 80,
      Cell: ({ row }: { row: MRT_Row<Security> }) => (
        <Badge color={row.original.active ? 'green' : 'gray'} variant="light" size="sm">
          {row.original.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Security> }) =>
        row.original.dateCreated ?
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" /> :
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
    enableGrouping: true,
    positionActionsColumn: 'last',
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/security-master/securities/${row.original.securityId}`),
      style: { cursor: 'pointer' },
    }),
    initialState: {
      sorting: [{ id: 'symbol', desc: false }],
      density: 'xs',
    },
    renderRowActions: ({ row }: { row: MRT_Row<Security> }) => (
      <ActionIcon
        variant="subtle"
        color="red"
        onClick={(e) => {
          e.stopPropagation();
          onDelete('security', row.original.securityId, row.original.symbol);
        }}
      >
        <IconTrash size={16} />
      </ActionIcon>
    ),
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

export default React.memo(SecuritiesTab);
