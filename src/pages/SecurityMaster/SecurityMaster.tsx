import { useState, useMemo } from 'react';
import {
  ActionIcon,
  Group,
  NumberInput,
  Container,
  Notification,
  Tabs,
  Title,
  Space,
  TextInput,
  Select,
  Modal,
  FileButton,
  Button,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconEdit, IconRefresh, IconTrash, IconUpload, IconDownload } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row, type MRT_TableInstance } from 'mantine-react-table';
import { useGlobalState } from '../../context/GlobalStateContext';
import { AWS_REGIONS, Exchange, Listing, Security, SchemaType, SecurityType } from '../../types';
import { registryApi } from '../../utils/api';
import * as XLSX from 'xlsx';
import { formatSecurityType } from '../../utils/security-master';

function SecurityMaster() {
  const [activeTab, setActiveTab] = useState<string | null>('securities');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    exchanges: number;
    securities: number;
    listings: number;
  }>({ exchanges: 0, securities: 0, listings: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{
    type: 'exchange' | 'security' | 'listing';
    id: number;
    name: string;
  } | null>(null);

  const { 
    securities, 
    exchanges, 
    listings, 
    loading, 
    error,
    refreshSecurities,
    refreshExchanges,
    refreshListings,
  } = useGlobalState();

  const handleRefresh = async () => {
    await Promise.all([
      refreshSecurities(),
      refreshExchanges(),
      refreshListings(),
    ]);
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    
    setUploadFile(file);
    setUploadError(null);
    setUploadProgress({ exchanges: 0, securities: 0, listings: 0 });

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      const processSheet = async (sheetName: string, processFn: (row: any) => Promise<void>) => {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return;

        const rows = XLSX.utils.sheet_to_json(sheet);
        for (let i = 0; i < rows.length; i++) {
          await processFn(rows[i]);
          setUploadProgress(prev => ({
            ...prev,
            [sheetName.toLowerCase()]: i + 1
          }));
        }
      };

      await processSheet('Exchanges', async (row) => {
        await registryApi.createExchange(row);
      });

      await processSheet('Securities', async (row) => {
        await registryApi.createSecurity(row);
      });

      await processSheet('Listings', async (row) => {
        await registryApi.createListing(row);
      });

      await handleRefresh();
      setUploadModalOpen(false);
      setUploadFile(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to process file');
    }
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    const exchangesData = [{
      exchangeName: 'Binance',
      region: 'us-east-1',
      schemaType: 'mbp-10',
    }];

    const securitiesData = [{
      symbol: 'BTC',
      type: 0,
      description: 'BTC Spot',
    }];

    const listingsData = [{
      exchangeId: 1,
      securityId: 1,
      exchangeSecurityId: 'BTC',
      exchangeSecuritySymbol: 'BTC',
    }];

    const exchangesWs = XLSX.utils.json_to_sheet(exchangesData);
    const securitiesWs = XLSX.utils.json_to_sheet(securitiesData);
    const listingsWs = XLSX.utils.json_to_sheet(listingsData);

    XLSX.utils.book_append_sheet(wb, exchangesWs, 'Exchanges');
    XLSX.utils.book_append_sheet(wb, securitiesWs, 'Securities');
    XLSX.utils.book_append_sheet(wb, listingsWs, 'Listings');

    XLSX.writeFile(wb, 'security_master_template.xlsx');
  };

  const handleDownloadData = () => {
    const wb = XLSX.utils.book_new();

    const exchangesWs = XLSX.utils.json_to_sheet(exchanges);
    const securitiesWs = XLSX.utils.json_to_sheet(securities);
    const listingsWs = XLSX.utils.json_to_sheet(listings);

    XLSX.utils.book_append_sheet(wb, exchangesWs, 'Exchanges');
    XLSX.utils.book_append_sheet(wb, securitiesWs, 'Securities');
    XLSX.utils.book_append_sheet(wb, listingsWs, 'Listings');

    XLSX.writeFile(wb, 'security_master_data.xlsx');
  };

  const getDefaultTableProps = () => ({
    enableRowActions: true,
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    enableEditing: true,
    editDisplayMode: 'row' as const,
    positionActionsColumn: 'last' as const,
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
  });

  const handleDelete = async (type: 'exchange' | 'security' | 'listing', id: number, name: string) => {
    setDeleteItem({ type, id, name });
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;

    try {
      switch (deleteItem.type) {
        case 'exchange':
          await registryApi.deleteExchange(deleteItem.id);
          await refreshExchanges();
          break;
        case 'security':
          await registryApi.deleteSecurity(deleteItem.id);
          await refreshSecurities();
          break;
        case 'listing':
          await registryApi.deleteListing(deleteItem.id);
          await refreshListings();
          break;
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setDeleteModalOpen(false);
      setDeleteItem(null);
    }
  };

  const renderSecurityRowActions = ({ row, table }: { row: MRT_Row<Security>; table: MRT_TableInstance<Security> }) => (
    <Group gap={4} justify="center" wrap="nowrap">
      <ActionIcon
        variant="subtle"
        color="blue"
        onClick={() => table.setEditingRow(row)}
      >
        <IconEdit size={16} />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        onClick={() => handleDelete('security', row.original.securityId, row.original.symbol)}
      >
        <IconTrash size={16} />
      </ActionIcon>
    </Group>
  );

  const renderExchangeRowActions = ({ row, table }: { row: MRT_Row<Exchange>; table: MRT_TableInstance<Exchange> }) => (
    <Group gap={4} justify="center" wrap="nowrap">
      <ActionIcon
        variant="subtle"
        color="blue"
        onClick={() => table.setEditingRow(row)}
      >
        <IconEdit size={16} />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        onClick={() => handleDelete('exchange', row.original.exchangeId, row.original.exchangeName)}
      >
        <IconTrash size={16} />
      </ActionIcon>
    </Group>
  );

  const renderListingRowActions = ({ row, table }: { row: MRT_Row<Listing>; table: MRT_TableInstance<Listing> }) => (
    <Group gap={4} justify="center" wrap="nowrap">
      <ActionIcon
        variant="subtle"
        color="blue"
        onClick={() => table.setEditingRow(row)}
      >
        <IconEdit size={16} />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        onClick={() => handleDelete('listing', row.original.listingId, row.original.exchangeSecuritySymbol)}
      >
        <IconTrash size={16} />
      </ActionIcon>
    </Group>
  );

  const securityColumns = useMemo<MRT_ColumnDef<Security>[]>(() => [
    {
      accessorKey: 'securityId',
      header: 'ID',
      enableSorting: true,
      enableEditing: false,
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
      Cell: ({ row }: { row: MRT_Row<Security> }) => {
        return formatSecurityType(row.original.type);
      },
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

  const exchangeColumns = useMemo<MRT_ColumnDef<Exchange>[]>(() => [
    {
      accessorKey: 'exchangeId',
      header: 'ID',
      enableSorting: true,
      enableEditing: false,
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

  const listingColumns = useMemo<MRT_ColumnDef<Listing>[]>(() => [
    {
      accessorKey: 'listingId',
      header: 'ID',
      enableSorting: true,
      enableEditing: false,
    },
    {
      accessorKey: 'securityId',
      header: 'Security ID',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <NumberInput
          defaultValue={cell.getValue<number>()}
          onChange={(value) => {
            row.original.securityId = Number(value) || 0;
          }}
        />
      ),
    },
    {
      accessorKey: 'exchangeId',
      header: 'Exchange ID',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <NumberInput
          defaultValue={cell.getValue<number>()}
          onChange={(value) => {
            row.original.exchangeId = Number(value) || 0;
          }}
        />
      ),
    },
    {
      accessorKey: 'exchangeSecurityId',
      header: 'Exchange Security ID',
      enableSorting: true,
      enableEditing: true,
      Edit: ({ cell, row }) => (
        <TextInput
          defaultValue={cell.getValue<string>()}
          onChange={(e) => {
            row.original.exchangeSecurityId = e.target.value;
          }}
        />
      ),
    },
    {
      accessorKey: 'exchangeSecuritySymbol',
      header: 'Exchange Symbol',
      enableSorting: true,
      enableEditing: true,
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
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<Listing> }) => 
        row.original.dateCreated ? 
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" /> : 
          '-',
    },
    {
      accessorKey: 'dateModified',
      header: 'Modified',
      enableSorting: true,
      enableEditing: false,
      Cell: ({ row }: { row: MRT_Row<Listing> }) => 
        row.original.dateModified ? 
          <ReactTimeAgo date={new Date(row.original.dateModified)} timeStyle="round" /> : 
          '-',
    },
  ], []);

  const securityTable = useMantineReactTable({
    columns: securityColumns,
    data: securities,
    state: { isLoading: loading.securities },
    renderRowActions: renderSecurityRowActions,
    onEditingRowSave: async ({ row, table }: { row: MRT_Row<Security>; table: MRT_TableInstance<Security> }) => {
      await registryApi.updateSecurity(row.original.securityId, row.original);
      table.setEditingRow(null);
      refreshSecurities();
    },
    initialState: {
      sorting: [{ id: 'securityId', desc: false }],
    },
    ...getDefaultTableProps(),
  });

  const exchangeTable = useMantineReactTable({
    columns: exchangeColumns,
    data: exchanges,
    state: { isLoading: loading.exchanges },
    renderRowActions: renderExchangeRowActions,
    onEditingRowSave: async ({ row, table }: { row: MRT_Row<Exchange>; table: MRT_TableInstance<Exchange> }) => {
      await registryApi.updateExchange(row.original.exchangeId, row.original);
      table.setEditingRow(null);
      refreshExchanges();
    },
    initialState: {
      sorting: [{ id: 'exchangeId', desc: false }],
    },
    ...getDefaultTableProps(),
  });

  const listingTable = useMantineReactTable({
    columns: listingColumns,
    data: listings,
    state: { isLoading: loading.listings },
    renderRowActions: renderListingRowActions,
    onEditingRowSave: async ({ row, table }: { row: MRT_Row<Listing>; table: MRT_TableInstance<Listing> }) => {
      await registryApi.updateListing(row.original.listingId, row.original);
      table.setEditingRow(null);
      refreshListings();
    },
    initialState: {
      sorting: [{ id: 'listingId', desc: false }],
    },
    ...getDefaultTableProps(),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Security Master</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon 
              size="lg" 
              variant="filled" 
              color="green"
              onClick={handleRefresh}
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Download Data" position="bottom" withArrow openDelay={500}>
            <ActionIcon 
              size="lg" 
              variant="filled" 
              color="blue"
              onClick={handleDownloadData}
            >
              <IconDownload size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Upload New Data" position="bottom" withArrow openDelay={500}>
            <ActionIcon 
              size="lg" 
              variant="filled" 
              color="green"
              onClick={() => setUploadModalOpen(true)}
            >
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Modal
        opened={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload Excel File"
        size="lg"
      >
        <Stack>
          <Text>Upload an Excel file with sheets named "Exchanges", "Securities", and "Listings" to create new entries.</Text>
          
          <Group>
            <FileButton
              onChange={handleFileUpload}
              accept=".xlsx,.xls"
            >
              {(props) => (
                <Button
                  {...props}
                  leftSection={<IconUpload size={20} />}
                  variant="filled"
                  color="blue"
                >
                  Upload Excel File
                </Button>
              )}
            </FileButton>

            <Button
              onClick={handleDownloadTemplate}
              leftSection={<IconDownload size={20} />}
              variant="outline"
              color="blue"
            >
              Download Template
            </Button>
          </Group>

          {uploadFile && (
            <Stack>
              <Text>Processing file: {uploadFile.name}</Text>
              <Text>Exchanges processed: {uploadProgress.exchanges}</Text>
              <Text>Securities processed: {uploadProgress.securities}</Text>
              <Text>Listings processed: {uploadProgress.listings}</Text>
            </Stack>
          )}

          {uploadError && (
            <Text c="red">{uploadError}</Text>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Delete"
        size="sm"
      >
        <Stack>
          <Text>
            Are you sure you want to delete this {deleteItem?.type}?
            {deleteItem && (
              <Text fw={500} mt="xs">
                {deleteItem.name}
              </Text>
            )}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {(error.securities || error.exchanges || error.listings) && (
        <Notification 
          color="red" 
          title="Error" 
          onClose={() => {/* TODO: Add error clear handler */}}
          mb="md"
        >
          {error.securities || error.exchanges || error.listings}
        </Notification>
      )}

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="securities">Securities</Tabs.Tab>
          <Tabs.Tab value="exchanges">Exchanges</Tabs.Tab>
          <Tabs.Tab value="listings">Listings</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="securities">
          <Space h="md" />
          <MantineReactTable table={securityTable} />
        </Tabs.Panel>

        <Tabs.Panel value="exchanges">
          <Space h="md" />
          <MantineReactTable table={exchangeTable} />
        </Tabs.Panel>

        <Tabs.Panel value="listings">
          <Space h="md" />
          <MantineReactTable table={listingTable} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}

export default SecurityMaster;
