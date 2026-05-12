import { useState, useMemo } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Tooltip,
} from '@mantine/core';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { useGlobalState } from '../../context/GlobalStateContext';
import { ListingSpec } from '../../types';
import { registryApi } from '../../utils/api';
import { formatUnscaled, unscaleNotional, unscalePrice, unscaleSize } from '../../utils/security-master';

interface DenormalizedListingSpec extends ListingSpec {
  listingLabel: string;
  tickSizeUnscaled: number;
  lotSizeUnscaled: number;
  minNotionalUnscaled?: number;
}

interface ListingSpecsTabProps {
  onDelete: (type: 'listingSpec', id: number, name: string) => void;
}

function ListingSpecsTab({ onDelete }: ListingSpecsTabProps) {
  const {
    listingSpecs,
    listings,
    exchanges,
    securities,
    loading,
    refreshListingSpecs,
  } = useGlobalState();

  const [createListingSpecOpen, setCreateListingSpecOpen] = useState(false);
  const [newListingSpec, setNewListingSpec] = useState({
    listingId: 0,
    tickSize: 0,
    lotSize: 0,
    minNotional: 0,
  });

  const exchangeMap = useMemo(
    () => new Map(exchanges.map(e => [e.exchangeId, e])),
    [exchanges],
  );
  const securityMap = useMemo(
    () => new Map(securities.map(s => [s.securityId, s])),
    [securities],
  );

  const listingSelectData = useMemo(() =>
    listings.map(l => {
      const exchange = exchangeMap.get(l.exchangeId);
      const security = securityMap.get(l.securityId);
      return {
        value: l.listingId.toString(),
        label: `${exchange?.exchangeName ?? l.exchangeId} - ${security?.symbol ?? l.securityId} (${l.exchangeSecuritySymbol})`,
      };
    }),
    [listings, exchangeMap, securityMap],
  );

  const denormalizedSpecs = useMemo<DenormalizedListingSpec[]>(() => {
    const listingMap = new Map(listings.map(l => [l.listingId, l]));
    return listingSpecs.map(spec => {
      const listing = listingMap.get(spec.listingId);
      const exchange = listing ? exchangeMap.get(listing.exchangeId) : undefined;
      const security = listing ? securityMap.get(listing.securityId) : undefined;
      const label = listing
        ? `${exchange?.exchangeName ?? listing.exchangeId} - ${security?.symbol ?? listing.securityId}`
        : `Listing ${spec.listingId}`;
      return {
        ...spec,
        listingLabel: label,
        tickSizeUnscaled: unscalePrice(spec.tickSize),
        lotSizeUnscaled: unscaleSize(spec.lotSize),
        minNotionalUnscaled: spec.minNotional !== undefined ? unscaleNotional(spec.minNotional) : undefined,
      };
    });
  }, [listingSpecs, listings, exchangeMap, securityMap]);

  const handleCreateListingSpec = async () => {
    try {
      await registryApi.createListingSpec(newListingSpec);
      await refreshListingSpecs();
      setCreateListingSpecOpen(false);
      setNewListingSpec({ listingId: 0, tickSize: 0, lotSize: 0, minNotional: 0 });
    } catch (err) {
      console.error('Failed to create listing spec:', err);
    }
  };

  const columns = useMemo<MRT_ColumnDef<DenormalizedListingSpec>[]>(() => [
    {
      accessorKey: 'listingLabel',
      header: 'Listing',
      enableSorting: true,
      enableEditing: false,
    },
    {
      accessorKey: 'tickSize',
      header: 'Tick Size (raw)',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <NumberInput
          defaultValue={cell.getValue<number>()}
          onChange={(value) => {
            row.original.tickSize = Number(value) || 0;
          }}
        />
      ),
    },
    {
      accessorKey: 'tickSizeUnscaled',
      header: 'Tick Size',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListingSpec> }) => formatUnscaled(row.original.tickSizeUnscaled),
    },
    {
      accessorKey: 'lotSize',
      header: 'Lot Size (raw)',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <NumberInput
          defaultValue={cell.getValue<number>()}
          onChange={(value) => {
            row.original.lotSize = Number(value) || 0;
          }}
        />
      ),
    },
    {
      accessorKey: 'lotSizeUnscaled',
      header: 'Lot Size',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListingSpec> }) => formatUnscaled(row.original.lotSizeUnscaled),
    },
    {
      accessorKey: 'minNotional',
      header: 'Min Notional (raw)',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <NumberInput
          defaultValue={cell.getValue<number>()}
          onChange={(value) => {
            row.original.minNotional = Number(value) || 0;
          }}
        />
      ),
    },
    {
      accessorKey: 'minNotionalUnscaled',
      header: 'Min Notional',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListingSpec> }) =>
        row.original.minNotionalUnscaled !== undefined ? formatUnscaled(row.original.minNotionalUnscaled) : '-',
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListingSpec> }) =>
        row.original.dateCreated ?
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" /> :
          '-',
    },
    {
      accessorKey: 'dateModified',
      header: 'Modified',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListingSpec> }) =>
        row.original.dateModified ?
          <ReactTimeAgo date={new Date(row.original.dateModified)} timeStyle="round" /> :
          '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: denormalizedSpecs,
    state: { isLoading: loading.listingSpecs },
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
      sorting: [{ id: 'listingLabel', desc: false }],
      density: 'xs',
    },
    renderRowActions: ({ row, table: t }: { row: MRT_Row<DenormalizedListingSpec>; table: MRT_TableInstance<DenormalizedListingSpec> }) => (
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
          onClick={() => onDelete('listingSpec', row.original.listingId, row.original.listingLabel)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
    onEditingRowSave: async ({ row, table: t }: { row: MRT_Row<DenormalizedListingSpec>; table: MRT_TableInstance<DenormalizedListingSpec> }) => {
      await registryApi.updateListingSpec(row.original.listingId, row.original);
      t.setEditingRow(null);
      refreshListingSpecs();
    },
    renderTopToolbarCustomActions: () => (
      <Tooltip label="Add Listing Spec" position="bottom" withArrow openDelay={500}>
        <ActionIcon
          size="lg"
          variant="filled"
          color="green"
          onClick={() => setCreateListingSpecOpen(true)}
        >
          <IconPlus size={20} />
        </ActionIcon>
      </Tooltip>
    ),
  });

  return (
    <>
      <Modal
        opened={createListingSpecOpen}
        onClose={() => setCreateListingSpecOpen(false)}
        title="Create Listing Spec"
        size="sm"
      >
        <Stack>
          <Select
            label="Listing"
            data={listingSelectData}
            value={newListingSpec.listingId > 0 ? newListingSpec.listingId.toString() : null}
            onChange={(value) => setNewListingSpec(prev => ({ ...prev, listingId: parseInt(value || '0') }))}
            searchable
            required
          />
          <NumberInput
            label="Tick Size"
            value={newListingSpec.tickSize}
            onChange={(value) => setNewListingSpec(prev => ({ ...prev, tickSize: Number(value) || 0 }))}
            required
          />
          <NumberInput
            label="Lot Size"
            value={newListingSpec.lotSize}
            onChange={(value) => setNewListingSpec(prev => ({ ...prev, lotSize: Number(value) || 0 }))}
            required
          />
          <NumberInput
            label="Min Notional"
            value={newListingSpec.minNotional}
            onChange={(value) => setNewListingSpec(prev => ({ ...prev, minNotional: Number(value) || 0 }))}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCreateListingSpecOpen(false)}>Cancel</Button>
            <Button color="green" onClick={handleCreateListingSpec}>Create</Button>
          </Group>
        </Stack>
      </Modal>
      <MantineReactTable table={table} />
    </>
  );
}

export default ListingSpecsTab;
