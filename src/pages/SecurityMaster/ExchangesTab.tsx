import React, { useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { useGlobalState } from '../../context/GlobalStateContext';
import { AWS_REGIONS, Exchange } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { ExchangeDraft, exchangePatch, homeZoneOptions, zoneLabel } from '../../utils/zones';

interface ExchangesTabProps {
  onDelete: (type: 'exchange', id: number, name: string) => void;
}

function ExchangesTab({ onDelete }: ExchangesTabProps) {
  const { exchanges, loading, refreshExchanges } = useGlobalState();

  const [createExchangeOpen, setCreateExchangeOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  // The row being edited: its changes held apart from the table's data (sent, only what changed, on save; dropped on
  // cancel), and its region as chosen, so the zone picker follows it.
  const draft = useRef<ExchangeDraft>({});
  const [draftRegion, setDraftRegion] = useState<string | null>(null);
  const resetDraft = () => {
    draft.current = {};
    setDraftRegion(null);
  };
  const [newExchangeForm, setNewExchangeForm] = useState({
    exchangeCode: '',
    exchangeName: '',
    region: '',
  });

  const handleCreateExchange = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      await registryApi.createExchange(newExchangeForm);
      await refreshExchanges();
      setCreateExchangeOpen(false);
      setNewExchangeForm({ exchangeCode: '', exchangeName: '', region: '' });
    } catch (err) {
      setCreateError(errorMessage(err, 'Failed to create exchange'));
    } finally {
      setCreating(false);
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
      accessorKey: 'exchangeCode',
      header: 'Code',
      enableSorting: true,
      enableEditing: true,
      size: 160,
      Edit: ({ cell }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => {
            draft.current.exchangeCode = e.target.value.toUpperCase();
          }}
        />
      ),
    },
    {
      accessorKey: 'exchangeName',
      header: 'Name',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => {
            draft.current.exchangeName = e.target.value;
          }}
        />
      ),
    },
    {
      accessorKey: 'region',
      header: 'Region',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell }) => (
        <Select
          defaultValue={cell.getValue<string>()}
          data={AWS_REGIONS}
          onChange={(value) => {
            // A zone belongs to one region: a zone picked under the old region goes, and the zone picker follows. The
            // registry drops the home zone on a move unless a new one comes with it.
            draft.current.region = value || '';
            delete draft.current.homeZoneId;
            setDraftRegion(value || '');
          }}
        />
      ),
    },
    {
      accessorKey: 'homeZoneId',
      header: 'Home zone',
      enableSorting: true,
      enableEditing: true,
      Header: () => (
        <Tooltip
          multiline
          w={320}
          withArrow
          label={'Where its order gateways and production market-data shards run: the zone measured nearest the venue.'
            + ' Changing it moves paper gateways and idle live gateways at once, a live gateway with orders at its next'
            + ' start, and production shards without a gap.'}
        >
          <Text fw={600} size="sm">Home zone</Text>
        </Tooltip>
      ),
      Cell: ({ row }: { row: MRT_Row<Exchange> }) => zoneLabel(row.original.homeZoneId),
      Edit: ({ row }) => {
        const region = draftRegion ?? row.original.region;
        const moved = region !== row.original.region;
        return (
          <Select
            key={region}
            defaultValue={moved ? null : row.original.homeZoneId ?? null}
            data={homeZoneOptions(region)}
            placeholder="None"
            clearable
            onChange={(value) => {
              draft.current.homeZoneId = value ?? null;
            }}
          />
        );
      },
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
  ], [draftRegion]);

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
          onClick={() => {
            resetDraft();
            t.setEditingRow(row);
          }}
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
      setEditError(null);
      const patch = exchangePatch(row.original, draft.current);
      if (Object.keys(patch).length > 0) {
        try {
          await registryApi.updateExchange(row.original.exchangeId, patch);
        } catch (err) {
          setEditError(errorMessage(err, 'Failed to update exchange'));
          return;
        }
      }
      resetDraft();
      t.setEditingRow(null);
      refreshExchanges();
    },
    onEditingRowCancel: () => resetDraft(),
    renderTopToolbarCustomActions: () => (
      <Tooltip label="Add Exchange" position="bottom" withArrow openDelay={500}>
        <ActionIcon
          size="lg"
          variant="filled"
          color="green"
          onClick={() => { setCreateError(null); setCreateExchangeOpen(true); }}
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
        onClose={() => { if (creating) return; setCreateExchangeOpen(false); }}
        title="Create Exchange"
        size="sm"
      >
        <Stack>
          <TextInput
            label="Exchange Code"
            description="Identifier services match on, e.g. KALSHI, POLYMARKET_INTL or POLYMARKET_US"
            value={newExchangeForm.exchangeCode}
            onChange={(e) => setNewExchangeForm(prev => ({ ...prev, exchangeCode: e.target.value.toUpperCase() }))}
            required
          />
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
          {createError && <Text c="red" size="sm">{createError}</Text>}
          <Group justify="flex-end">
            <Button variant="outline" disabled={creating} onClick={() => setCreateExchangeOpen(false)}>Cancel</Button>
            <Button color="green" loading={creating} onClick={handleCreateExchange}>Create</Button>
          </Group>
        </Stack>
      </Modal>
      {editError && (
        <Alert color="red" title="Error" mb="md" withCloseButton onClose={() => setEditError(null)}>
          {editError}
        </Alert>
      )}
      <MantineReactTable table={table} />
    </>
  );
}

export default React.memo(ExchangesTab);
