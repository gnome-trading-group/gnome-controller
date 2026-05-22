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
import { Listing } from '../../types';
import { registryApi } from '../../utils/api';
import { formatSecurityType } from '../../utils/security-master';

interface DenormalizedListing extends Listing {
  exchangeName: string;
  securitySymbol: string;
  securityType: number;
  active: boolean;
}

interface ListingsTabProps {
  onDelete: (type: 'listing', id: number, name: string) => void;
}

function ListingsTab({ onDelete }: ListingsTabProps) {
  const { listings, exchanges, securities, loading, refreshListings } = useGlobalState();
  const navigate = useNavigate();

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

    return listings.map(listing => {
      const exchange = exchangeMap.get(listing.exchangeId);
      const security = securityMap.get(listing.securityId);
      return {
        ...listing,
        exchangeName: exchange?.exchangeName ?? `Exchange ${listing.exchangeId}`,
        securitySymbol: security?.symbol ?? `Security ${listing.securityId}`,
        securityType: security?.type ?? -1,
        active: security?.active ?? false,
      };
    });
  }, [listings, exchanges, securities]);

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
      accessorKey: 'securitySymbol',
      header: 'Security',
      enableSorting: true,
      enableGrouping: true,
    },
    {
      accessorKey: 'exchangeName',
      header: 'Exchange',
      enableSorting: true,
      enableGrouping: true,
    },
    {
      accessorKey: 'securityType',
      header: 'Type',
      enableSorting: true,
      enableGrouping: true,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        formatSecurityType(row.original.securityType),
    },
    {
      accessorKey: 'exchangeSecuritySymbol',
      header: 'Exchange Symbol',
      enableSorting: true,
    },
    {
      accessorKey: 'active',
      header: 'Active',
      enableSorting: true,
      enableGrouping: true,
      size: 80,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) => (
        <Badge color={row.original.active ? 'green' : 'gray'} variant="light" size="sm">
          {row.original.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        row.original.dateCreated ?
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" /> :
          '-',
    },
  ], []);

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
    enableGrouping: true,
    positionActionsColumn: 'last',
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/security-master/listings/${row.original.listingId}`),
      style: { cursor: 'pointer' },
    }),
    initialState: {
      sorting: [{ id: 'securitySymbol', desc: false }],
      density: 'xs',
    },
    renderRowActions: ({ row }: { row: MRT_Row<DenormalizedListing> }) => (
      <ActionIcon
        variant="subtle"
        color="red"
        onClick={(e) => {
          e.stopPropagation();
          onDelete('listing', row.original.listingId, row.original.exchangeSecuritySymbol);
        }}
      >
        <IconTrash size={16} />
      </ActionIcon>
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

export default React.memo(ListingsTab);
