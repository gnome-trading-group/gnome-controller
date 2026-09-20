import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  JsonInput,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconEdit, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { Strategy, StrategyStatus, ConfigValue } from '../../types';
import { registryApi } from '../../utils/api';
import { useListingSearch } from '../../hooks/useAsyncSearch';
import { navigateRowProps } from '../../utils/navigation';
import {
  defaultSimulationState,
  ListingProfileRow,
  ProfilesEditor,
  ProfilesState,
  simulationProfilesFromConfig,
  simulationProfilesToConfig,
} from '../../components/SimulationConfigForm';

const STATUS_LABELS: Record<number, string> = {
  [StrategyStatus.INACTIVE]: 'Inactive',
  [StrategyStatus.ACTIVE]: 'Active',
  [StrategyStatus.PAUSED]: 'Paused',
};

const STATUS_COLORS: Record<number, string> = {
  [StrategyStatus.INACTIVE]: 'gray',
  [StrategyStatus.ACTIVE]: 'green',
  [StrategyStatus.PAUSED]: 'yellow',
};

function defaultForm() {
  return {
    name: '',
    description: '',
    status: StrategyStatus.INACTIVE,
    mode: 'paper',
    strategyType: 'java',
    strategyClass: '',
    region: '',
    researchCommit: '',
    args: [] as { key: string; value: string | number | boolean; type: 'string' | 'number' | 'boolean' | 'json' }[],
  };
}

function defaultProfiles(): ProfilesState {
  return { default: defaultSimulationState() };
}

function defaultListings(): ListingProfileRow[] {
  return [{ listingId: '', profile: 'default' }];
}

function Strategies() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Strategy | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [profiles, setProfiles] = useState<ProfilesState>(defaultProfiles());
  const [listings, setListings] = useState<ListingProfileRow[]>(defaultListings());
  const [liveListingIds, setLiveListingIds] = useState<string[]>([]);
  const [liveListingItems, setLiveListingItems] = useState<Record<string, string>>({});
  const [liveListingSearchValue, setLiveListingSearchValue] = useState('');
  const { options: liveListingSearchOptions, isLoading: liveListingSearchLoading } = useListingSearch(liveListingSearchValue);
  const [formError, setFormError] = useState<string | null>(null);

  const liveListingMergedData = useMemo(() => [
    ...Object.entries(liveListingItems)
      .filter(([id]) => !liveListingSearchOptions.some(o => o.value === id))
      .map(([id, label]) => ({ value: id, label })),
    ...liveListingSearchOptions,
  ], [liveListingItems, liveListingSearchOptions]);

  const handleLiveListingChange = useCallback((values: string[]) => {
    setLiveListingIds(values);
    const updated = { ...liveListingItems };
    for (const v of values) {
      if (!updated[v]) {
        const opt = liveListingSearchOptions.find(o => o.value === v);
        if (opt) updated[v] = opt.label;
      }
    }
    for (const key of Object.keys(updated)) {
      if (!values.includes(key)) delete updated[key];
    }
    setLiveListingItems(updated);
  }, [liveListingItems, liveListingSearchOptions]);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Strategy | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await registryApi.listStrategies();
      setStrategies(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm());
    setProfiles(defaultProfiles());
    setListings(defaultListings());
    setLiveListingIds([]);
    setLiveListingItems({});
    setLiveListingSearchValue('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = useCallback((strategy: Strategy) => {
    const p = strategy.parameters as Record<string, unknown> | undefined ?? {};
    const args = p.args && typeof p.args === 'object'
      ? Object.entries(p.args as Record<string, unknown>).map(([key, value]) => {
          if (typeof value === 'number') return { key, value, type: 'number' as const };
          if (typeof value === 'boolean') return { key, value, type: 'boolean' as const };
          if (typeof value === 'object' && value !== null) return { key, value: JSON.stringify(value, null, 2), type: 'json' as const };
          return { key, value: String(value), type: 'string' as const };
        })
      : [];

    setForm({
      name: strategy.name ?? '',
      description: strategy.description ?? '',
      status: strategy.status,
      mode: p.mode ? String(p.mode) : 'paper',
      strategyType: p.strategyType ? String(p.strategyType) : 'java',
      strategyClass: p.strategyClass ? String(p.strategyClass) : '',
      region: p.region ? String(p.region) : '',
      researchCommit: p.researchCommit ? String(p.researchCommit) : '',
      args,
    });
    if (Array.isArray(p.listings)) {
      setLiveListingIds((p.listings as number[]).map(String));
    } else {
      setLiveListingIds([]);
    }
    setLiveListingItems({});
    setLiveListingSearchValue('');

    if (p.simulation && typeof p.simulation === 'object') {
      const { profiles: loadedProfiles, listings: loadedListings } = simulationProfilesFromConfig(
        p.simulation as Record<string, string>
      );
      setProfiles(Object.keys(loadedProfiles).length > 0 ? loadedProfiles : defaultProfiles());
      setListings(loadedListings.length > 0 ? loadedListings : defaultListings());
    } else {
      setProfiles(defaultProfiles());
      setListings(defaultListings());
    }

    setEditTarget(strategy);
    setFormError(null);
    setModalOpen(true);
  }, []);

  const handleSubmit = async () => {
    setFormError(null);
    try {
      const args: Record<string, ConfigValue> = {};
      for (const { key, value, type } of form.args) {
        if (key.trim()) {
          args[key.trim()] = type === 'json' ? JSON.parse(value as string) : value;
        }
      }
      const parameters: Record<string, unknown> = {
        mode: form.mode,
        strategy_type: form.strategyType,
        strategy_class: form.strategyClass,
      };
      if (form.mode === 'live') parameters.listings = liveListingIds.map(Number);
      if (form.region.trim()) parameters.region = form.region.trim();
      if (form.researchCommit.trim()) parameters.research_commit = form.researchCommit.trim();
      if (Object.keys(args).length > 0) parameters.args = args;
      if (form.mode === 'paper') parameters.simulation = simulationProfilesToConfig(profiles, listings);

      if (editTarget) {
        await registryApi.updateStrategy(editTarget.strategyId, {
          name: form.name,
          description: form.description || undefined,
          status: form.status,
          parameters,
        });
      } else {
        await registryApi.createStrategy({
          name: form.name,
          description: form.description || undefined,
          status: form.status,
          parameters,
        });
      }

      setModalOpen(false);
      refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : `Failed to ${editTarget ? 'update' : 'create'} strategy`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await registryApi.deleteStrategy(deleteTarget.strategyId);
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      console.error('Failed to delete strategy:', e);
    }
  };

  const columns = useMemo<MRT_ColumnDef<Strategy>[]>(() => [
    {
      accessorKey: 'strategyId',
      header: 'ID',
      enableSorting: true,
      size: 60,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Strategy> }) => (
        <Badge color={STATUS_COLORS[row.original.status]} variant="light">
          {STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Strategy> }) =>
        row.original.dateCreated
          ? <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
          : '-',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: strategies,
    state: { isLoading: loading },
    enableRowActions: true,
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    positionActionsColumn: 'last' as const,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/strategies/${row.original.strategyId}`),
    initialState: { sorting: [{ id: 'strategyId', desc: false }], density: 'xs' },
    renderRowActions: ({ row }: { row: MRT_Row<Strategy> }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <ActionIcon variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
          <IconEdit size={16} />
        </ActionIcon>
        <ActionIcon variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row.original); setDeleteModalOpen(true); }}>
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Strategies</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Create Strategy" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="blue" onClick={openCreate}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Strategy' : 'Create Strategy'} size="lg">
        <Stack>
          <TextInput label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <TextInput label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Select label="Status" value={form.status.toString()} data={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} onChange={(v) => setForm((f) => ({ ...f, status: parseInt(v ?? '0') }))} />

          <Divider />
          <Title order={6} c="dimmed">Default Config</Title>
          <Group grow>
            <Select label="Mode" value={form.mode} data={[{ value: 'paper', label: 'Paper' }, { value: 'live', label: 'Live' }]} onChange={(v) => setForm((f) => ({ ...f, mode: v ?? 'paper' }))} />
            <Select label="Strategy Type" value={form.strategyType} data={[{ value: 'java', label: 'Java' }, { value: 'python', label: 'Python' }]} onChange={(v) => setForm((f) => ({ ...f, strategyType: v ?? 'java' }))} />
          </Group>
          <TextInput label="Strategy Class" placeholder="com.example.MyStrategy or module:ClassName" value={form.strategyClass} onChange={(e) => setForm((f) => ({ ...f, strategyClass: e.target.value }))} />
          {form.mode === 'live' && (
            <MultiSelect
              label="Listings"
              placeholder="Search listings..."
              data={liveListingMergedData}
              value={liveListingIds}
              onChange={handleLiveListingChange}
              searchable
              searchValue={liveListingSearchValue}
              onSearchChange={setLiveListingSearchValue}
              nothingFoundMessage={liveListingSearchLoading ? 'Loading...' : 'No listings found'}
            />
          )}
          <Group grow>
            <TextInput label="Region (optional)" placeholder="us-east-1" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            <TextInput label="Research Commit (optional)" placeholder="main" value={form.researchCommit} onChange={(e) => setForm((f) => ({ ...f, researchCommit: e.target.value }))} />
          </Group>

          <Divider />
          <Group justify="space-between">
            <Title order={6} c="dimmed">Strategy Args</Title>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => setForm((f) => ({ ...f, args: [...f.args, { key: '', value: '', type: 'string' as const }] }))}>
              <IconPlus size={14} />
            </ActionIcon>
          </Group>
          {form.args.map((row, i) => (
            <Group key={i} gap="xs" align="flex-start">
              <TextInput placeholder="key" value={row.key} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, key: v } : r) })); }} style={{ flex: 1 }} />
              <Select
                data={[{ value: 'string', label: 'String' }, { value: 'number', label: 'Number' }, { value: 'boolean', label: 'Boolean' }, { value: 'json', label: 'JSON' }]}
                value={row.type}
                onChange={(v) => setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, type: (v ?? 'string') as typeof r.type, value: v === 'boolean' ? false : v === 'number' ? 0 : '' } : r) }))}
                w={100}
              />
              {row.type === 'number' && (
                <NumberInput value={row.value as number} onChange={(v) => setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, value: v === '' ? 0 : Number(v) } : r) }))} style={{ flex: 1 }} />
              )}
              {row.type === 'boolean' && (
                <Switch checked={row.value as boolean} onChange={(e) => { const checked = e.currentTarget.checked; setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, value: checked } : r) })); }} mt={6} />
              )}
              {row.type === 'json' && (
                <JsonInput value={row.value as string} onChange={(v) => setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, value: v } : r) }))} validationError="Invalid JSON" formatOnBlur autosize minRows={1} style={{ flex: 1 }} />
              )}
              {row.type === 'string' && (
                <TextInput placeholder="value" value={row.value as string} onChange={(e) => { const v = e.currentTarget.value; setForm((f) => ({ ...f, args: f.args.map((r, j) => j === i ? { ...r, value: v } : r) })); }} style={{ flex: 1 }} />
              )}
              <ActionIcon variant="subtle" color="red" mt={6} onClick={() => setForm((f) => ({ ...f, args: f.args.filter((_, j) => j !== i) }))}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}

          {form.mode === 'paper' && (
            <ProfilesEditor
              profiles={profiles}
              listings={listings}
              onProfilesChange={setProfiles}
              onListingsChange={setListings}
            />
          )}

          {formError && <Text c="red" size="sm">{formError}</Text>}
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editTarget ? 'Save' : 'Create'}</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Confirm Delete" size="sm">
        <Stack>
          <Text>Delete strategy <Text span fw={500}>{deleteTarget?.name}</Text>?</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button color="red" onClick={handleDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default Strategies;
