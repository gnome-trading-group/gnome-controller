import { useState, useMemo } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { useGlobalState } from '../../context/GlobalStateContext';
import { Listing } from '../../types';
import { registryApi } from '../../utils/api';
import { formatSecurityType, formatUnscaled, unscaleNotional, unscalePrice, unscaleSize } from '../../utils/security-master';

interface DenormalizedListing extends Listing {
  exchangeName: string;
  securitySymbol: string;
  securityType: number;
  schemaType: string;
  region: string;
  tickSize?: number;
  lotSize?: number;
  minNotional?: number;
}

interface ListingsTabProps {
  onDelete: (type: 'listing', id: number, name: string) => void;
}

function ListingsTab({ onDelete }: ListingsTabProps) {
  const {
    listings,
    exchanges,
    securities,
    listingSpecs,
    loading,
    refreshListings,
  } = useGlobalState();

  const [createListingOpen, setCreateListingOpen] = useState(false);
  const [newListingForm, setNewListingForm] = useState({
    exchangeId: 0,
    securityId: 0,
    exchangeSecurityId: '',
    exchangeSecuritySymbol: '',
  });

  const denormalizedListings = useMemo<DenormalizedListing[]>(() => {
    const exchangeMap = new Map(exchanges.map(e => [e.exchangeId, e]));
    const securityMap = new Map(securities.map(s => [s.securityId, s]));
    const specMap = new Map(listingSpecs.map(ls => [ls.listingId, ls]));

    return listings.map(listing => {
      const exchange = exchangeMap.get(listing.exchangeId);
      const security = securityMap.get(listing.securityId);
      const spec = specMap.get(listing.listingId);
      return {
        ...listing,
        exchangeName: exchange?.exchangeName ?? `Exchange ${listing.exchangeId}`,
        securitySymbol: security?.symbol ?? `Security ${listing.securityId}`,
        securityType: security?.type ?? -1,
        schemaType: exchange?.schemaType ?? '',
        region: exchange?.region ?? '',
        tickSize: spec?.tickSize,
        lotSize: spec?.lotSize,
        minNotional: spec?.minNotional,
      };
    });
  }, [listings, exchanges, securities, listingSpecs]);

  const handleCreateListing = async () => {
    try {
      await registryApi.createListing(newListingForm);
      await refreshListings();
      setCreateListingOpen(false);
      setNewListingForm({ exchangeId: 0, securityId: 0, exchangeSecurityId: '', exchangeSecuritySymbol: '' });
    } catch (err) {
      console.error('Failed to create listing:', err);
    }
  };

  const columns = useMemo<MRT_ColumnDef<DenormalizedListing>[]>(() => [
    {
      accessorKey: 'listingId',
      header: 'ID',
      enableSorting: true,
      enableEditing: false,
      enableGrouping: false,
      size: 60,
    },
    {
      accessorKey: 'exchangeName',
      header: 'Exchange',
      enableSorting: true,
      enableEditing: true,
      enableGrouping: true,
      Edit: ({ row }) => (
        <Select
          defaultValue={row.original.exchangeId.toString()}
          data={exchanges.map(e => ({ value: e.exchangeId.toString(), label: e.exchangeName }))}
          searchable
          onChange={(value) => {
            const id = parseInt(value || '0');
            row.original.exchangeId = id;
            const exchange = exchanges.find(e => e.exchangeId === id);
            if (exchange) {
              row.original.exchangeName = exchange.exchangeName;
              row.original.schemaType = exchange.schemaType;
              row.original.region = exchange.region;
            }
          }}
        />
      ),
    },
    {
      accessorKey: 'securitySymbol',
      header: 'Security',
      enableSorting: true,
      enableEditing: true,
      enableGrouping: true,
      Edit: ({ row }) => (
        <Select
          defaultValue={row.original.securityId.toString()}
          data={securities.map(s => ({ value: s.securityId.toString(), label: s.symbol }))}
          searchable
          onChange={(value) => {
            const id = parseInt(value || '0');
            row.original.securityId = id;
            const security = securities.find(s => s.securityId === id);
            if (security) {
              row.original.securitySymbol = security.symbol;
              row.original.securityType = security.type;
            }
          }}
        />
      ),
    },
    {
      accessorKey: 'securityType',
      header: 'Type',
      enableSorting: true,
      enableEditing: false,
      enableGrouping: true,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        formatSecurityType(row.original.securityType),
    },
    {
      accessorKey: 'exchangeSecuritySymbol',
      header: 'Exchange Symbol',
      enableSorting: true,
      enableEditing: true,
      enableGrouping: false,
      Edit: ({ cell, row }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => {
            row.original.exchangeSecuritySymbol = e.target.value;
          }}
        />
      ),
    },
    {
      accessorKey: 'schemaType',
      header: 'Schema Type',
      enableSorting: true,
      enableEditing: false,
      enableGrouping: true,
    },
    {
      accessorKey: 'tickSize',
      header: 'Tick Size',
      enableSorting: true,
      enableEditing: false,
      enableGrouping: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        row.original.tickSize !== undefined ? formatUnscaled(unscalePrice(row.original.tickSize)) : '-',
    },
    {
      accessorKey: 'lotSize',
      header: 'Lot Size',
      enableSorting: true,
      enableEditing: false,
      enableGrouping: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        row.original.lotSize !== undefined ? formatUnscaled(unscaleSize(row.original.lotSize)) : '-',
    },
    {
      accessorKey: 'minNotional',
      header: 'Min Notional',
      enableSorting: true,
      enableEditing: false,
      enableGrouping: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        row.original.minNotional !== undefined ? formatUnscaled(unscaleNotional(row.original.minNotional)) : '-',
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      enableEditing: false,
      enableGrouping: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        row.original.dateCreated ?
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" /> :
          '-',
    },
    {
      accessorKey: 'dateModified',
      header: 'Modified',
      enableSorting: true,
      enableEditing: false,
      enableGrouping: false,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        row.original.dateModified ?
          <ReactTimeAgo date={new Date(row.original.dateModified)} timeStyle="round" /> :
          '-',
    },
  ], [exchanges, securities]);

  const table = useMantineReactTable({
    columns,
    data: denormalizedListings,
    state: { isLoading: loading.listings },
    enableRowActions: true,
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    enableEditing: true,
    enableGrouping: true,
    editDisplayMode: 'row',
    positionActionsColumn: 'last',
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    initialState: {
      sorting: [{ id: 'listingId', desc: false }],
      density: 'xs',
    },
    renderRowActions: ({ row, table: t }: { row: MRT_Row<DenormalizedListing>; table: MRT_TableInstance<DenormalizedListing> }) => (
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
          onClick={() => onDelete('listing', row.original.listingId, row.original.exchangeSecuritySymbol)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
    onEditingRowSave: async ({ row, table: t }: { row: MRT_Row<DenormalizedListing>; table: MRT_TableInstance<DenormalizedListing> }) => {
      await registryApi.updateListing(row.original.listingId, {
        exchangeId: row.original.exchangeId,
        securityId: row.original.securityId,
        exchangeSecurityId: row.original.exchangeSecurityId,
        exchangeSecuritySymbol: row.original.exchangeSecuritySymbol,
      });
      t.setEditingRow(null);
      refreshListings();
    },
    renderDetailPanel: ({ row }) => (
      <SimpleGrid cols={3} p="md">
        <Stack gap="xs">
          <Text fw={600} size="sm">Exchange</Text>
          <Text size="sm">ID: {row.original.exchangeId}</Text>
          <Text size="sm">Name: {row.original.exchangeName}</Text>
          <Text size="sm">Region: {row.original.region}</Text>
          <Text size="sm">Schema: {row.original.schemaType}</Text>
        </Stack>
        <Stack gap="xs">
          <Text fw={600} size="sm">Security</Text>
          <Text size="sm">ID: {row.original.securityId}</Text>
          <Text size="sm">Symbol: {row.original.securitySymbol}</Text>
          <Text size="sm">Type: {formatSecurityType(row.original.securityType)}</Text>
        </Stack>
        <Stack gap="xs">
          <Text fw={600} size="sm">Listing Spec</Text>
          {row.original.tickSize !== undefined ? (
            <>
              <Text size="sm">Tick Size: {formatUnscaled(unscalePrice(row.original.tickSize))} ({row.original.tickSize})</Text>
              <Text size="sm">Lot Size: {formatUnscaled(unscaleSize(row.original.lotSize!))} ({row.original.lotSize})</Text>
              <Text size="sm">Min Notional: {row.original.minNotional !== undefined ? `${formatUnscaled(unscaleNotional(row.original.minNotional))} (${row.original.minNotional})` : '-'}</Text>
            </>
          ) : (
            <Text size="sm" c="dimmed">No listing spec</Text>
          )}
        </Stack>
      </SimpleGrid>
    ),
    renderTopToolbarCustomActions: () => (
      <Tooltip label="Add Listing" position="bottom" withArrow openDelay={500}>
        <ActionIcon
          size="lg"
          variant="filled"
          color="green"
          onClick={() => setCreateListingOpen(true)}
        >
          <IconPlus size={20} />
        </ActionIcon>
      </Tooltip>
    ),
  });

  return (
    <>
      <Modal
        opened={createListingOpen}
        onClose={() => setCreateListingOpen(false)}
        title="Create Listing"
        size="sm"
      >
        <Stack>
          <Select
            label="Exchange"
            data={exchanges.map(e => ({ value: e.exchangeId.toString(), label: e.exchangeName }))}
            value={newListingForm.exchangeId > 0 ? newListingForm.exchangeId.toString() : null}
            onChange={(value) => setNewListingForm(prev => ({ ...prev, exchangeId: parseInt(value || '0') }))}
            searchable
            required
          />
          <Select
            label="Security"
            data={securities.map(s => ({ value: s.securityId.toString(), label: s.symbol }))}
            value={newListingForm.securityId > 0 ? newListingForm.securityId.toString() : null}
            onChange={(value) => setNewListingForm(prev => ({ ...prev, securityId: parseInt(value || '0') }))}
            searchable
            required
          />
          <TextInput
            label="Exchange Security ID"
            value={newListingForm.exchangeSecurityId}
            onChange={(e) => setNewListingForm(prev => ({ ...prev, exchangeSecurityId: e.target.value }))}
            required
          />
          <TextInput
            label="Exchange Security Symbol"
            value={newListingForm.exchangeSecuritySymbol}
            onChange={(e) => setNewListingForm(prev => ({ ...prev, exchangeSecuritySymbol: e.target.value }))}
            required
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCreateListingOpen(false)}>Cancel</Button>
            <Button color="green" onClick={handleCreateListing}>Create</Button>
          </Group>
        </Stack>
      </Modal>
      <MantineReactTable table={table} />
    </>
  );
}

export default ListingsTab;
