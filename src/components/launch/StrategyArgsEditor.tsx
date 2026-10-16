import { ActionIcon, Group, JsonInput, NumberInput, Select, Switch, TextInput, Title } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { ArgRow, ArgType } from '../../utils/launch-settings';

const TYPE_OPTIONS = [
  { value: 'string', label: 'String' }, { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' }, { value: 'json', label: 'JSON' },
];

function emptyValue(type: ArgType): ArgRow['value'] {
  return type === 'boolean' ? false : type === 'number' ? 0 : '';
}

// A strategy's constructor arguments, one row each, typed so a number arrives as a number and an object as an object.
export function StrategyArgsEditor({ rows, onChange, title = 'Strategy Args' }: {
  rows: ArgRow[];
  onChange: (rows: ArgRow[]) => void;
  title?: string;
}) {
  const update = (i: number, patch: Partial<ArgRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <>
      <Group justify="space-between">
        <Title order={6} c="dimmed">{title}</Title>
        <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => onChange([...rows, { key: '', value: '', type: 'string' }])}>
          <IconPlus size={14} />
        </ActionIcon>
      </Group>
      {rows.map((row, i) => (
        <Group key={i} gap="xs" align="flex-start">
          <TextInput placeholder="key" value={row.key} onChange={e => update(i, { key: e.currentTarget.value })} style={{ flex: 1 }} />
          <Select data={TYPE_OPTIONS} value={row.type} w={100}
            onChange={v => update(i, { type: (v ?? 'string') as ArgType, value: emptyValue((v ?? 'string') as ArgType) })} />
          {row.type === 'number' && (
            <NumberInput value={row.value as number} onChange={v => update(i, { value: v === '' ? 0 : Number(v) })} style={{ flex: 1 }} />
          )}
          {row.type === 'boolean' && (
            <Switch checked={row.value as boolean} onChange={e => update(i, { value: e.currentTarget.checked })} mt={6} />
          )}
          {row.type === 'json' && (
            <JsonInput value={row.value as string} onChange={v => update(i, { value: v })} validationError="Invalid JSON"
              formatOnBlur autosize minRows={1} style={{ flex: 1 }} />
          )}
          {row.type === 'string' && (
            <TextInput placeholder="value" value={row.value as string} onChange={e => update(i, { value: e.currentTarget.value })} style={{ flex: 1 }} />
          )}
          <ActionIcon variant="subtle" color="red" mt={6} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
    </>
  );
}
