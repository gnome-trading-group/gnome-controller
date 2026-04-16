import { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Title,
  Button,
  Group,
  Modal,
  TextInput,
  Textarea,
  Stack,
  Notification,
  Center,
  Loader,
  ActionIcon,
  Tooltip,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconRefresh, IconTrash, IconEdit } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { controllerApi } from '../../utils/api';
import type { BacktestPreset } from '../../types/backtests';

function formatDate(iso: string | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function BacktestPresets() {
  const [presets, setPresets] = useState<BacktestPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state.
  const [opened, { open, close }] = useDisclosure(false);
  const [editingPreset, setEditingPreset] = useState<BacktestPreset | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formConfig, setFormConfig] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await controllerApi.listPresets();
      setPresets(response.presets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditingPreset(null);
    setFormName('');
    setFormDescription('');
    setFormConfig('');
    open();
  };

  const openEdit = (preset: BacktestPreset) => {
    setEditingPreset(preset);
    setFormName(preset.name);
    setFormDescription(preset.description);
    setFormConfig(preset.config);
    open();
  };

  const handleSave = async () => {
    if (!formName.trim() || !formConfig.trim()) return;
    try {
      setSaving(true);
      setError(null);
      if (editingPreset) {
        await controllerApi.updatePreset(editingPreset.presetId, {
          name: formName,
          description: formDescription,
          config: formConfig,
        });
      } else {
        await controllerApi.createPreset({
          name: formName,
          description: formDescription,
          config: formConfig,
        });
      }
      close();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (presetId: string) => {
    if (!confirm('Delete this preset?')) return;
    try {
      setError(null);
      await controllerApi.deletePreset(presetId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
    }
  };

  const columns = useMemo<MRT_ColumnDef<BacktestPreset>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        accessorKey: 'description',
        header: 'Description',
        Cell: ({ cell }) => {
          const val = cell.getValue<string>();
          return (
            <Text size="sm" lineClamp={1}>
              {val || '-'}
            </Text>
          );
        },
      },
      {
        accessorKey: 'createdBy',
        header: 'Created By',
      },
      {
        accessorKey: 'updatedAt',
        header: 'Last Updated',
        Cell: ({ cell }) => formatDate(cell.getValue<string>()),
      },
      {
        id: 'actions',
        header: '',
        size: 100,
        Cell: ({ row }) => (
          <Group gap="xs">
            <Tooltip label="Edit">
              <ActionIcon
                variant="subtle"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(row.original);
                }}
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(row.original.presetId);
                }}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ),
      },
    ],
    [],
  );

  const table = useMantineReactTable({
    columns,
    data: presets,
    enablePagination: false,
  });

  if (loading && presets.length === 0) {
    return (
      <Center h="50vh">
        <Loader />
      </Center>
    );
  }

  return (
    <Container size="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Backtest Presets</Title>
        <Group>
          <Tooltip label="Refresh">
            <ActionIcon variant="subtle" onClick={loadData} loading={loading}>
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            New Preset
          </Button>
        </Group>
      </Group>

      {error && (
        <Notification color="red" onClose={() => setError(null)} mb="md">
          {error}
        </Notification>
      )}

      <MantineReactTable table={table} />

      <Modal
        opened={opened}
        onClose={close}
        title={editingPreset ? 'Edit Preset' : 'New Preset'}
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="e.g. Momentum BTC 5min"
            value={formName}
            onChange={(e) => setFormName(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Description"
            placeholder="Optional description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.currentTarget.value)}
          />
          <Textarea
            label="Config (YAML)"
            placeholder="Paste your backtest YAML config here"
            value={formConfig}
            onChange={(e) => setFormConfig(e.currentTarget.value)}
            minRows={12}
            autosize
            maxRows={24}
            styles={{ input: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
            required
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={!formName.trim() || !formConfig.trim()}
            >
              {editingPreset ? 'Save Changes' : 'Create Preset'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default BacktestPresets;
