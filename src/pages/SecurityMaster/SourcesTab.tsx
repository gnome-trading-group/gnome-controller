import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Divider, Group, Modal, NumberInput, Select, Stack, Switch, TagsInput, Text, TextInput } from '@mantine/core';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { AWS_REGIONS, ConnectionScope, Source } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { connectionLimitLabel, isValidLimit, limitOrNull, SCOPE_NOUN } from '../../utils/source-capacity';
import { useGlobalState } from '../../context/GlobalStateContext';

interface SourceForm {
  code: string;
  homeRegion: string;
  adapter: string;
  families: string[];
  active: boolean;
  // Capacity; '' is no limit for the optional ones.
  maxPerConnection: number | '';
  connectionScope: ConnectionScope;
  connectionsPerScope: number | '';
  clientMessagesPerMinute: number | '';
}

const EMPTY_FORM: SourceForm = {
  code: '', homeRegion: '', adapter: '', families: [], active: true,
  maxPerConnection: '', connectionScope: 'IP', connectionsPerScope: '', clientMessagesPerMinute: '',
};

const SCOPE_OPTIONS: { value: ConnectionScope; label: string }[] = [
  { value: 'IP', label: 'IP address' },
  { value: 'KEY', label: 'API key' },
  { value: 'ACCOUNT', label: 'Account' },
];

function SourcesTab() {
  const { exchanges } = useGlobalState();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null: modal closed; a source id: editing that source; 'new': adding a vendor.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [editingVenue, setEditingVenue] = useState(false);
  const [form, setForm] = useState<SourceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSources(await registryApi.listSources());
    } catch (err) {
      setError(errorMessage(err, 'Failed to load sources'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exchangeRegion = useCallback(
    (exchangeId: number | null) => exchanges.find(e => e.exchangeId === exchangeId)?.region ?? '-',
    [exchanges],
  );

  const openNew = () => {
    setForm(EMPTY_FORM);
    setSaveError(null);
    setEditingVenue(false);
    setEditing('new');
  };

  const openEdit = (source: Source) => {
    setForm({
      code: source.code,
      homeRegion: source.homeRegion ?? '',
      adapter: source.adapter,
      families: source.families,
      active: source.active,
      maxPerConnection: source.maxPerConnection,
      connectionScope: source.connectionScope,
      connectionsPerScope: source.connectionsPerScope ?? '',
      clientMessagesPerMinute: source.clientMessagesPerMinute ?? '',
    });
    setSaveError(null);
    setEditingVenue(source.kind === 'VENUE');
    setEditing(source.sourceId);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing === 'new') {
        await registryApi.createVendorSource({
          code: form.code.trim().toUpperCase(),
          homeRegion: form.homeRegion,
          adapter: form.adapter.trim(),
          families: form.families,
        });
      } else if (editing !== null) {
        const capacity = {
          maxPerConnection: form.maxPerConnection === '' ? undefined : form.maxPerConnection,
          connectionScope: form.connectionScope,
          connectionsPerScope: limitOrNull(form.connectionsPerScope),
          clientMessagesPerMinute: limitOrNull(form.clientMessagesPerMinute),
        };
        // A venue's region and adapter come with its exchange; the registry refuses a home region on one.
        await registryApi.updateSource(editing, editingVenue
          ? { active: form.active, ...capacity }
          : {
            homeRegion: form.homeRegion,
            adapter: form.adapter.trim(),
            families: form.families,
            active: form.active,
            ...capacity,
          });
      }
      setEditing(null);
      await load();
    } catch (err) {
      setSaveError(errorMessage(err, 'Failed to save source'));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<MRT_ColumnDef<Source>[]>(() => [
    { accessorKey: 'code', header: 'Code' },
    {
      accessorKey: 'kind',
      header: 'Kind',
      size: 100,
      Cell: ({ row }: { row: MRT_Row<Source> }) => (
        <Badge variant="light" color={row.original.kind === 'VENUE' ? 'blue' : 'grape'}>{row.original.kind}</Badge>
      ),
    },
    {
      id: 'region',
      header: 'Collected in',
      Cell: ({ row }: { row: MRT_Row<Source> }) =>
        row.original.kind === 'VENUE' ? exchangeRegion(row.original.exchangeId) : row.original.homeRegion ?? '-',
    },
    { accessorKey: 'adapter', header: 'Adapter' },
    {
      accessorKey: 'families',
      header: 'Families',
      Cell: ({ row }: { row: MRT_Row<Source> }) => row.original.families.join(', '),
    },
    { accessorKey: 'maxPerConnection', header: 'Per connection', size: 110 },
    {
      id: 'connectionLimit',
      header: 'Connection limit',
      Cell: ({ row }: { row: MRT_Row<Source> }) => connectionLimitLabel(row.original),
    },
    {
      accessorKey: 'clientMessagesPerMinute',
      header: 'Client msgs/min',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<Source> }) => row.original.clientMessagesPerMinute ?? '—',
    },
    {
      accessorKey: 'active',
      header: 'Active',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<Source> }) => (row.original.active ? 'Yes' : 'No'),
    },
  ], [exchangeRegion]);

  const table = useMantineReactTable({
    columns,
    data: sources,
    state: { isLoading: loading },
    enableColumnFilters: false,
    enablePagination: false,
    enableRowActions: true,
    positionActionsColumn: 'last',
    renderRowActions: ({ row }) => (
      <Button size="compact-xs" variant="subtle" leftSection={<IconEdit size={14} />} onClick={() => openEdit(row.original)}>
        Edit
      </Button>
    ),
    renderTopToolbarCustomActions: () => (
      <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openNew}>Add vendor</Button>
    ),
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs' },
  });

  const isNew = editing === 'new';
  const capacityValid = isValidLimit(form.connectionsPerScope) && isValidLimit(form.clientMessagesPerMinute)
    && (isNew || (form.maxPerConnection !== '' && isValidLimit(form.maxPerConnection)));
  const canSave = capacityValid && (editingVenue
    || (form.homeRegion !== '' && form.adapter.trim() !== '' && form.families.length > 0
      && (!isNew || form.code.trim() !== '')));

  return (
    <>
      <Text size="sm" c="dimmed" mb="sm">
        A venue source is created with its exchange and collects in the exchange's region; only its capacity and
        whether it is active are edited here. Vendors are added here.
      </Text>
      {error && <Alert color="red" title="Error" mb="md">{error}</Alert>}
      <MantineReactTable table={table} />

      <Modal opened={editing !== null} onClose={() => setEditing(null)} title={isNew ? 'Add vendor source' : `Edit ${form.code}`}>
        <Stack>
          {saveError && <Alert color="red">{saveError}</Alert>}
          <TextInput
            id="source-code"
            label="Code"
            description="Fixed once created; shards, secrets and stored data are named after it."
            value={form.code}
            disabled={!isNew}
            onChange={e => setForm(f => ({ ...f, code: e.currentTarget.value }))}
          />
          {!editingVenue && (<>
          <Select
            id="source-home-region"
            label="Home region"
            description="Where the vendor's servers are; its streams are collected there."
            data={AWS_REGIONS}
            value={form.homeRegion || null}
            onChange={v => setForm(f => ({ ...f, homeRegion: v ?? '' }))}
            searchable
          />
          <TextInput
            id="source-adapter"
            label="Adapter"
            value={form.adapter}
            onChange={e => setForm(f => ({ ...f, adapter: e.currentTarget.value }))}
          />
          <TagsInput
            id="source-families"
            label="Record families"
            placeholder="e.g. esports"
            value={form.families}
            onChange={families => setForm(f => ({ ...f, families }))}
          />
          </>)}
          {!isNew && (
            <Switch
              id="source-active"
              label="Active"
              checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.currentTarget.checked }))}
            />
          )}
          {!isNew && (<>
            <Divider label="Capacity" labelPosition="left" />
            <Text size="xs" c="dimmed">
              Read by shard assignment: running shards pick up a change at their next assignment, not at once.
            </Text>
            <NumberInput
              id="source-max-per-connection"
              label="Markets per connection"
              min={1}
              allowDecimal={false}
              value={form.maxPerConnection}
              onChange={v => setForm(f => ({ ...f, maxPerConnection: typeof v === 'number' ? v : '' }))}
            />
            <Select
              id="source-connection-scope"
              label="Connection limit applies per"
              data={SCOPE_OPTIONS}
              value={form.connectionScope}
              allowDeselect={false}
              onChange={v => setForm(f => ({ ...f, connectionScope: (v as ConnectionScope) ?? f.connectionScope }))}
            />
            <NumberInput
              id="source-connections-per-scope"
              label={`Connections per ${SCOPE_NOUN[form.connectionScope]}`}
              description="Blank for no limit."
              min={1}
              allowDecimal={false}
              value={form.connectionsPerScope}
              onChange={v => setForm(f => ({ ...f, connectionsPerScope: typeof v === 'number' ? v : '' }))}
            />
            <NumberInput
              id="source-client-messages"
              label="Client messages per minute"
              description="Subscribe and other messages a client may send; blank for no limit."
              min={1}
              allowDecimal={false}
              value={form.clientMessagesPerMinute}
              onChange={v => setForm(f => ({ ...f, clientMessagesPerMinute: typeof v === 'number' ? v : '' }))}
            />
          </>)}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!canSave}>{isNew ? 'Add vendor' : 'Save'}</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default React.memo(SourcesTab);
