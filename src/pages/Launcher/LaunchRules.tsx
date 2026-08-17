import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ActionIcon, Badge, Button, Container, Group, Modal, NumberInput,
  ScrollArea, Select, Stack, Switch, TextInput, Title, Tooltip, Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconEdit, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { LaunchRule, RuleType } from '../../types/launcher';
import { launcherApi } from '../../utils/api';
import { SchemaFormFields } from '../../components/SchemaFormFields';

const LAUNCH_PATH_COLORS: Record<string, string> = {
  auto: 'green',
  approval: 'orange',
};


interface RuleFormValues {
  name: string;
  description: string;
  rule_type: string;
  launch_path: 'auto' | 'approval';
  max_concurrent_sessions: number | '';
  cooldown_minutes: number;
  dedup_window_minutes: number;
  parameters: Record<string, unknown>;
}

function RuleModal({
  opened,
  onClose,
  onSaved,
  rule,
  ruleTypes,
}: {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  rule: LaunchRule | null;
  ruleTypes: RuleType[];
}) {
  const [saving, setSaving] = useState(false);

  const form = useForm<RuleFormValues>({
    initialValues: {
      name: '',
      description: '',
      rule_type: '',
      launch_path: 'approval',
      max_concurrent_sessions: '',
      cooldown_minutes: 0,
      dedup_window_minutes: 60,
      parameters: {},
    },
  });

  useEffect(() => {
    if (opened) {
      form.setValues(rule ? {
        name: rule.name,
        description: rule.description ?? '',
        rule_type: rule.rule_type,
        launch_path: rule.launch_path,
        max_concurrent_sessions: rule.max_concurrent_sessions ?? '',
        cooldown_minutes: rule.cooldown_minutes,
        dedup_window_minutes: rule.dedup_window_minutes,
        parameters: { ...rule.parameters },
      } : {
        name: '',
        description: '',
        rule_type: ruleTypes[0]?.type ?? '',
        launch_path: 'approval',
        max_concurrent_sessions: '',
        cooldown_minutes: 0,
        dedup_window_minutes: 60,
        parameters: {},
      });
    }
  }, [opened, rule]);

  const selectedRuleType = ruleTypes.find(rt => rt.type === form.values.rule_type);
  const schema = selectedRuleType?.parameter_schema;

  const handleParamChange = useCallback((key: string, value: unknown) => {
    form.setFieldValue('parameters', { ...form.values.parameters, [key]: value });
  }, [form]);

  const handleRuleTypeChange = (type: string | null) => {
    form.setFieldValue('rule_type', type ?? '');
    form.setFieldValue('parameters', {});
  };

  const handleSubmit = async (values: RuleFormValues) => {
    setSaving(true);
    try {
      const params = Object.fromEntries(
        Object.entries(values.parameters).filter(([, v]) => v !== undefined && v !== '' && v !== null)
      );
      const body = {
        name: values.name,
        description: values.description || undefined,
        rule_type: values.rule_type,
        launch_path: values.launch_path,
        max_concurrent_sessions: values.max_concurrent_sessions !== '' ? values.max_concurrent_sessions : undefined,
        cooldown_minutes: values.cooldown_minutes,
        dedup_window_minutes: values.dedup_window_minutes,
        parameters: params,
      };
      if (rule) {
        await launcherApi.updateRule(rule.rule_id, body);
      } else {
        await launcherApi.createRule(body as Parameters<typeof launcherApi.createRule>[0]);
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={rule ? 'Edit Rule' : 'Create Rule'}
      size="lg"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="sm">
          <TextInput label="Name" required {...form.getInputProps('name')} />
          <TextInput label="Description" {...form.getInputProps('description')} />

          <Select
            label="Rule Type"
            required
            data={ruleTypes.map(rt => ({ value: rt.type, label: rt.display_name }))}
            value={form.values.rule_type}
            onChange={handleRuleTypeChange}
          />

          <Select
            label="Launch Path"
            required
            data={[
              { value: 'approval', label: 'Requires Approval' },
              { value: 'auto', label: 'Auto Launch' },
            ]}
            {...form.getInputProps('launch_path')}
          />

          <Group grow>
            <NumberInput
              label="Max Concurrent Sessions"
              description="Leave empty for no limit"
              value={form.values.max_concurrent_sessions}
              onChange={v => form.setFieldValue('max_concurrent_sessions', v as number | '')}
              min={1}
              allowDecimal={false}
            />
            <NumberInput
              label="Cooldown (minutes)"
              value={form.values.cooldown_minutes}
              onChange={v => form.setFieldValue('cooldown_minutes', Number(v))}
              min={0}
              allowDecimal={false}
            />
            <NumberInput
              label="Dedup Window (minutes)"
              value={form.values.dedup_window_minutes}
              onChange={v => form.setFieldValue('dedup_window_minutes', Number(v))}
              min={0}
              allowDecimal={false}
            />
          </Group>

          {schema?.properties && (
            <>
              <Text size="sm" fw={600} mt="xs">Parameters</Text>
              <SchemaFormFields
                properties={schema.properties}
                required={schema.required ?? []}
                values={form.values.parameters}
                onChange={handleParamChange}
              />
            </>
          )}

          <Group justify="flex-end" mt="sm">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>{rule ? 'Save' : 'Create'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function LaunchRules() {
  const [rules, setRules] = useState<LaunchRule[]>([]);
  const [ruleTypes, setRuleTypes] = useState<RuleType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LaunchRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LaunchRule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = () => {
    setIsLoading(true);
    Promise.all([launcherApi.listRules(), launcherApi.getRuleTypes()])
      .then(([r, rt]) => { setRules(r); setRuleTypes(rt); })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (rule: LaunchRule) => {
    setToggling(rule.rule_id);
    try {
      const updated = await launcherApi.updateRule(rule.rule_id, {
        status: rule.status === 'active' ? 'disabled' : 'active',
      });
      setRules(prev => prev.map(r => r.rule_id === rule.rule_id ? updated : r));
    } catch (e) {
      console.error(e);
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await launcherApi.deleteRule(deleteTarget.rule_id);
      setRules(prev => prev.filter(r => r.rule_id !== deleteTarget.rule_id));
      setDeleteTarget(null);
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  const ruleTypeMap = useMemo(
    () => Object.fromEntries(ruleTypes.map(rt => [rt.type, rt.display_name])),
    [ruleTypes],
  );

  const columns = useMemo<MRT_ColumnDef<LaunchRule>[]>(() => [
    {
      accessorKey: 'status',
      header: 'Active',
      size: 70,
      Cell: ({ row }: { row: MRT_Row<LaunchRule> }) => (
        <Switch
          checked={row.original.status === 'active'}
          onChange={() => handleToggle(row.original)}
          disabled={toggling === row.original.rule_id}
          onClick={e => e.stopPropagation()}
        />
      ),
    },
    { accessorKey: 'name', header: 'Name', size: 200 },
    {
      accessorKey: 'rule_type',
      header: 'Type',
      size: 160,
      Cell: ({ row }: { row: MRT_Row<LaunchRule> }) => (
        ruleTypeMap[row.original.rule_type] ?? row.original.rule_type
      ),
    },
    {
      accessorKey: 'launch_path',
      header: 'Launch Path',
      size: 130,
      Cell: ({ row }: { row: MRT_Row<LaunchRule> }) => (
        <Badge color={LAUNCH_PATH_COLORS[row.original.launch_path]} variant="light" size="sm">
          {row.original.launch_path === 'auto' ? 'Auto' : 'Requires Approval'}
        </Badge>
      ),
    },
    {
      accessorKey: 'cooldown_minutes',
      header: 'Cooldown',
      size: 100,
      Cell: ({ row }: { row: MRT_Row<LaunchRule> }) =>
        row.original.cooldown_minutes ? `${row.original.cooldown_minutes}m` : '—',
    },
    {
      accessorKey: 'max_concurrent_sessions',
      header: 'Max Concurrent',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<LaunchRule> }) =>
        row.original.max_concurrent_sessions ?? '—',
    },
  ], [ruleTypeMap, toggling]);

  const table = useMantineReactTable({
    columns,
    data: rules,
    initialState: { density: 'xs' },
    enableColumnFilters: false,
    enableRowActions: true,
    positionActionsColumn: 'last' as const,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    state: { isLoading },
    renderRowActions: ({ row }: { row: MRT_Row<LaunchRule> }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="blue"
          onClick={e => { e.stopPropagation(); setEditTarget(row.original); setModalOpen(true); }}
        >
          <IconEdit size={16} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="red"
          onClick={e => { e.stopPropagation(); setDeleteTarget(row.original); }}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Launch Rules</Title>
        <Group>
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={load} loading={isLoading}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Create Rule" position="bottom" withArrow openDelay={500}>
            <ActionIcon
              size="lg"
              variant="filled"
              color="blue"
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
            >
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <MantineReactTable table={table} />

      <RuleModal
        opened={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSaved={load}
        rule={editTarget}
        ruleTypes={ruleTypes}
      />

      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Rule"
        size="sm"
      >
        <Stack>
          <Text>Delete rule <Text span fw={500}>{deleteTarget?.name}</Text>? This cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" loading={deleting} onClick={handleDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default LaunchRules;
