import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collectorsApi } from '../../utils/api';
import { ApiError } from '../../utils/api';
import {
  Table,
  Button,
  ActionIcon,
  Group,
  Text,
  Modal,
  NumberInput,
  Stack,
  Title,
  Container,
  Paper,
  Badge,
  Loader,
  Center,
} from '@mantine/core';
import { IconPlus, IconTrash, IconRefresh } from '@tabler/icons-react';

interface Collector {
  listingId: number;
  status: string;
  lastHeartbeat: string;
  lastStatusChange: string;
  failureReason: string | null;
}

function MarketData() {
  const navigate = useNavigate();
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newListingId, setNewListingId] = useState<number | ''>('');

  useEffect(() => {
    loadCollectors();
  }, []);

  const loadCollectors = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await collectorsApi.list();
      setCollectors(response.collectors);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load collectors');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollector = async () => {
    if (!newListingId) return;
    
    try {
      setError(null);
      await collectorsApi.create(newListingId);
      setCreateModalOpen(false);
      setNewListingId('');
      await loadCollectors();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create collector');
      }
    }
  };

  const handleDeleteCollector = async (listingId: number) => {
    try {
      setError(null);
      await collectorsApi.delete(listingId);
      await loadCollectors();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to delete collector');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'yellow';
      case 'RUNNING': return 'green';
      case 'COMPLETED': return 'blue';
      case 'FAILED': return 'red';
      case 'INACTIVE': return 'gray';
      default: return 'gray';
    }
  };

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Active Collectors</Title>
        <Group>
          <ActionIcon 
            size="lg" 
            variant="filled" 
            color="green"
            onClick={loadCollectors}
          >
            <IconRefresh size={20} />
          </ActionIcon>
          <ActionIcon 
            size="lg" 
            variant="filled" 
            color="green"
            onClick={() => setCreateModalOpen(true)}
          >
            <IconPlus size={20} />
          </ActionIcon>
        </Group>
      </Group>

      {error && (
        <Text color="red" mb="md">{error}</Text>
      )}

      <Paper shadow="sm" p="md">
        {loading ? (
          <Center p="xl">
            <Loader />
          </Center>
        ) : (
          <Table striped highlightOnHover>
            <thead>
              <tr>
                <th>Listing ID</th>
                <th>Status</th>
                <th>Last Heartbeat</th>
                <th>Last Status Change</th>
                <th>Failure Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map(collector => (
                <tr 
                  key={collector.listingId}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/collectors/${collector.listingId}`)}
                >
                  <td>{collector.listingId}</td>
                  <td>
                    <Badge color={getStatusColor(collector.status)}>
                      {collector.status}
                    </Badge>
                  </td>
                  <td>{new Date(collector.lastHeartbeat).toLocaleString()}</td>
                  <td>{new Date(collector.lastStatusChange).toLocaleString()}</td>
                  <td>{collector.failureReason || '-'}</td>
                  <td>
                    <ActionIcon 
                      color="red" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCollector(collector.listingId);
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Paper>

      <Modal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Collector"
      >
        <Stack>
          <NumberInput
            label="Listing ID"
            value={newListingId}
            onChange={(value) => setNewListingId(value === '' ? '' : Number(value))}
            placeholder="Enter listing ID"
            required
          />
          <Button onClick={handleCreateCollector}>
            Create Collector
          </Button>
        </Stack>
      </Modal>
    </Container>
  );
}

export default MarketData;