import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Container,
  FileButton,
  Group,
  Modal,
  Notification,
  Space,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconDownload, IconPlus, IconRefresh, IconUpload } from '@tabler/icons-react';
import { useGlobalState } from '../../context/GlobalStateContext';
import { registryApi } from '../../utils/api';
import * as XLSX from 'xlsx';
import ListingsTab from './ListingsTab';
import SecuritiesTab from './SecuritiesTab';
import ExchangesTab from './ExchangesTab';
import ListingSpecsTab from './ListingSpecsTab';

type DeleteType = 'exchange' | 'security' | 'listing' | 'listingSpec';

function SecurityMaster() {
  const [activeTab, setActiveTab] = useState<string | null>('listings');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState({
    exchanges: 0,
    securities: 0,
    listings: 0,
    listingSpecs: 0,
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{
    type: DeleteType;
    id: number;
    name: string;
  } | null>(null);

  const {
    exchanges,
    securities,
    listings,
    listingSpecs,
    error,
    refreshSecurities,
    refreshExchanges,
    refreshListings,
    refreshListingSpecs,
  } = useGlobalState();

  const handleRefresh = async () => {
    await Promise.all([
      refreshSecurities(),
      refreshExchanges(),
      refreshListings(),
      refreshListingSpecs(),
    ]);
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;

    setUploadFile(file);
    setUploadError(null);
    setUploadProgress({ exchanges: 0, securities: 0, listings: 0, listingSpecs: 0 });

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

      await processSheet('Listing Specs', async (row) => {
        await registryApi.createListingSpec(row);
        setUploadProgress(prev => ({ ...prev, listingSpecs: (prev.listingSpecs || 0) + 1 }));
      });

      await handleRefresh();
      setUploadModalOpen(false);
      setUploadFile(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to process file');
    }
  };

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      exchangeName: 'Binance',
      region: 'us-east-1',
      schemaType: 'mbp-10',
    }]), 'Exchanges');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      symbol: 'BTC',
      type: 0,
      description: 'BTC Spot',
    }]), 'Securities');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      exchangeId: 1,
      securityId: 1,
      exchangeSecurityId: 'BTC',
      exchangeSecuritySymbol: 'BTC',
    }]), 'Listings');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      listingId: 1,
      tickSize: 100,
      lotSize: 1,
      minNotional: 0,
    }]), 'Listing Specs');

    XLSX.writeFile(wb, 'security_master_template.xlsx');
  };

  const handleDownloadData = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exchanges), 'Exchanges');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(securities), 'Securities');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(listings), 'Listings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(listingSpecs), 'Listing Specs');
    XLSX.writeFile(wb, 'security_master_data.xlsx');
  };

  const handleDelete = (type: DeleteType, id: number, name: string) => {
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
        case 'listingSpec':
          await registryApi.deleteListingSpec(deleteItem.id);
          await refreshListingSpecs();
          break;
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    } finally {
      setDeleteModalOpen(false);
      setDeleteItem(null);
    }
  };

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
          <Text>Upload an Excel file with sheets named "Exchanges", "Securities", "Listings", and "Listing Specs" to create new entries.</Text>

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
              <Text>Listing Specs processed: {uploadProgress.listingSpecs}</Text>
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

      {(error.securities || error.exchanges || error.listings || error.listingSpecs) && (
        <Notification
          color="red"
          title="Error"
          onClose={() => {}}
          mb="md"
        >
          {error.securities || error.exchanges || error.listings || error.listingSpecs}
        </Notification>
      )}

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="listings">Listings</Tabs.Tab>
          <Tabs.Tab value="securities">Securities</Tabs.Tab>
          <Tabs.Tab value="exchanges">Exchanges</Tabs.Tab>
          <Tabs.Tab value="listingSpecs">Listing Specs</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="listings">
          <Space h="md" />
          <ListingsTab onDelete={handleDelete} />
        </Tabs.Panel>

        <Tabs.Panel value="securities">
          <Space h="md" />
          <SecuritiesTab onDelete={handleDelete} />
        </Tabs.Panel>

        <Tabs.Panel value="exchanges">
          <Space h="md" />
          <ExchangesTab onDelete={handleDelete} />
        </Tabs.Panel>

        <Tabs.Panel value="listingSpecs">
          <Space h="md" />
          <ListingSpecsTab onDelete={handleDelete} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}

export default SecurityMaster;
