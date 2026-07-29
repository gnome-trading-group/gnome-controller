import React, { useState, useMemo } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  ComboboxItem,
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
import { navigateRowProps } from '../../utils/navigation';
import { useGlobalState } from '../../context/GlobalStateContext';
import { DenormalizedListing } from '../../types';
import { registryApi } from '../../utils/api';
import { formatSecurityType } from '../../utils/security-master';
import { useServerPaginatedTable } from '../../hooks/useServerPaginatedTable';
import { useSecuritySearch } from '../../hooks/useAsyncSearch';

interface ListingsTabProps {
  onDelete: (type: 'listing', id: number, name: string) => void;
  externalRefreshKey?: number;
}

function ListingsTab({ onDelete, externalRefreshKey }: ListingsTabProps) {
  const { exchanges } = useGlobalState();
  const navigate = useNavigate();

  const [createListingOpen, setCreateListingOpen] = useState(false);
  const [newListingForm, setNewListingForm] = useState({
    exchangeId: 0,
    securityId: 0,
    exchangeSecurityId: '',
    exchangeSecuritySymbol: '',
  });
  const [securitySearch, setSecuritySearch] = useState('');
  const { options: securityOptions, isLoading: securitySearchLoading } = useSecuritySearch(securitySearch);

  const {
    data: listings,
    total,
    isLoading,
    pagination,
    sorting,
    globalFilter,
    setPagination,
    setSorting,
    setGlobalFilter,
    refresh,
  } = useServerPaginatedTable<DenormalizedListing>({
    fetchFn: registryApi.listListingsPaginated,
    countFn: registryApi.countListings,
    externalRefreshKey,
  });

  const handleCreateListing = async () => {
    try {
      await registryApi.createListing(newListingForm);
      await refresh();
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
    },
    {
      accessorKey: 'exchangeName',
      header: 'Exchange',
      enableSorting: true,
    },
    {
      accessorKey: 'securityType',
      header: 'Type',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) =>
        formatSecurityType(row.original.securityType),
    },
    {
      accessorKey: 'exchangeSecuritySymbol',
      header: 'Exchange Symbol',
      enableSorting: true,
    },
    {
      accessorKey: 'securityActive',
      header: 'Active',
      enableSorting: true,
      size: 80,
      Cell: ({ row }: { row: MRT_Row<DenormalizedListing> }) => (
        <Badge color={row.original.securityActive ? 'green' : 'gray'} variant="light" size="sm">
          {row.original.securityActive ? 'Active' : 'Inactive'}
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
    data: listings,
    rowCount: total,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    state: {
      isLoading,
      pagination,
      sorting,
      globalFilter,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    enableRowActions: true,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    positionActionsColumn: 'last',
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    mantineTableBodyRowProps: ({ row }) => (
      navigateRowProps(navigate, `/security-master/listings/${row.original.listingId}`)
    ),
    initialState: {
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
            data={securityOptions as ComboboxItem[]}
            value={newListingForm.securityId > 0 ? newListingForm.securityId.toString() : null}
            onChange={(value) => setNewListingForm(prev => ({ ...prev, securityId: parseInt(value || '0') }))}
            onSearchChange={setSecuritySearch}
            searchValue={securitySearch}
            searchable
            nothingFoundMessage={securitySearchLoading ? 'Searching...' : 'Type to search securities'}
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
