import { useEffect, useState } from 'react';
import { ActionIcon, Button, Checkbox, Group, Input, JsonInput, MultiSelect, NumberInput, Select, Stack, TagsInput, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { JsonSchemaProperty } from '../types/jsonSchema';
import { resolve } from '../utils/schema';

function describe(prop: JsonSchemaProperty): string | undefined {
  const hasDefault = prop.default !== undefined && prop.default !== null;
  const fallback = hasDefault ? `default ${JSON.stringify(prop.default)}` : undefined;
  return [prop.description, fallback].filter(Boolean).join(' · ') || undefined;
}

export function SchemaFormFields({
  properties,
  required,
  values,
  onChange,
}: {
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <>
      {Object.entries(properties).map(([key, declared]) => {
        const prop = resolve(declared);
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const isRequired = required.includes(key);
        const value = values[key];
        const description = describe(prop);

        if (prop.type === 'integer' || prop.type === 'number') {
          return (
            <NumberInput
              key={key}
              label={label}
              description={description}
              required={isRequired}
              value={value !== undefined ? (value as number) : ''}
              onChange={v => onChange(key, v === '' ? undefined : Number(v))}
              allowDecimal={prop.type === 'number'}
              min={prop.minimum ?? prop.exclusiveMinimum}
              max={prop.maximum ?? prop.exclusiveMaximum}
            />
          );
        }

        if (prop.type === 'string' && prop.format === 'date') {
          return (
            <DateInput
              key={key}
              label={label}
              description={description}
              required={isRequired}
              clearable
              valueFormat="YYYY-MM-DD"
              value={value ? dayjs(value as string).toDate() : null}
              onChange={d => onChange(key, d ? dayjs(d).format('YYYY-MM-DD') : undefined)}
            />
          );
        }

        if (prop.type === 'string' && prop.enum) {
          return (
            <Select
              key={key}
              label={label}
              description={description}
              required={isRequired}
              data={prop.enum}
              value={(value as string) ?? null}
              onChange={v => onChange(key, v)}
            />
          );
        }

        if (prop.type === 'string') {
          return (
            <TextInput
              key={key}
              label={label}
              description={description}
              required={isRequired}
              value={(value as string) ?? ''}
              onChange={e => onChange(key, e.target.value || undefined)}
            />
          );
        }

        if (prop.type === 'boolean') {
          return (
            <Checkbox
              key={key}
              label={label}
              description={description}
              checked={(value as boolean) ?? false}
              onChange={e => onChange(key, e.currentTarget.checked)}
            />
          );
        }

        if (prop.type === 'array' && prop.items?.enum) {
          return (
            <MultiSelect
              key={key}
              label={label}
              description={description}
              required={isRequired}
              data={prop.items.enum}
              value={(value as string[]) ?? []}
              onChange={v => onChange(key, v.length ? v : undefined)}
            />
          );
        }

        if (prop.type === 'array' && prop.items?.type === 'string') {
          return (
            <TagsInput
              key={key}
              label={label}
              description={description}
              required={isRequired}
              value={(value as string[]) ?? []}
              onChange={v => onChange(key, v.length ? v : undefined)}
            />
          );
        }

        if (prop.type === 'array' && prop.items?.type === 'integer') {
          return (
            <TagsInput
              key={key}
              label={label}
              description={description}
              required={isRequired}
              value={((value as number[]) ?? []).map(String)}
              onChange={v => {
                const nums = v.map(Number).filter(n => !isNaN(n));
                onChange(key, nums.length ? nums : undefined);
              }}
            />
          );
        }

        const valueType = typeof prop.additionalProperties === 'object' ? prop.additionalProperties.type : undefined;
        if (prop.type === 'object' && (valueType === 'number' || valueType === 'string')) {
          return (
            <KeyValueField
              key={key}
              label={label}
              description={description}
              numeric={valueType === 'number'}
              value={(value as Record<string, string | number>) ?? {}}
              onChange={v => onChange(key, Object.keys(v).length ? v : undefined)}
            />
          );
        }

        if (prop.type === 'object') {
          return (
            <JsonField
              key={key}
              label={label}
              description={description}
              required={isRequired}
              value={value as Record<string, unknown> | undefined}
              onChange={v => onChange(key, v)}
            />
          );
        }

        return null;
      })}
    </>
  );
}

// A JSON object edited as text. The text is the field's own state, so a half-typed object stays on screen; the
// parsed value only moves when the text is valid JSON, and an error shows once the field loses focus.
export function JsonField({ label, description, required, value, onChange, minRows = 3 }: {
  label: string;
  description?: string;
  required?: boolean;
  value: Record<string, unknown> | undefined;
  onChange: (value: Record<string, unknown> | undefined) => void;
  minRows?: number;
}) {
  const [text, setText] = useState(() => (value ? JSON.stringify(value, null, 2) : ''));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Only a change from outside (a reset, a loaded rule) replaces what is being typed.
    const current = (() => { try { return text.trim() ? JSON.parse(text) : undefined; } catch { return null; } })();
    if (JSON.stringify(current) !== JSON.stringify(value)) setText(value ? JSON.stringify(value, null, 2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (raw: string) => {
    if (!raw.trim()) { setError(null); onChange(undefined); return; }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('must be a JSON object');
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };
  return (
    <JsonInput
      label={label}
      description={description ?? 'JSON object'}
      required={required}
      value={text}
      onChange={raw => { setText(raw); try { const p = JSON.parse(raw); if (p && typeof p === 'object' && !Array.isArray(p)) { setError(null); onChange(p); } } catch { /* shown on blur */ } }}
      onBlur={() => commit(text)}
      error={error}
      formatOnBlur
      autosize
      minRows={minRows}
    />
  );
}

// A flat map from names to numbers or strings (per-venue fee rates), one row per entry.
function KeyValueField({ label, description, numeric, value, onChange }: {
  label: string;
  description?: string;
  numeric: boolean;
  value: Record<string, string | number>;
  onChange: (value: Record<string, string | number>) => void;
}) {
  const [rows, setRows] = useState(() => Object.entries(value).map(([k, v]) => ({ key: k, value: v as string | number | '' })));
  useEffect(() => {
    const current = Object.fromEntries(rows.filter(r => r.key.trim() && r.value !== '').map(r => [r.key.trim(), r.value]));
    if (JSON.stringify(current) !== JSON.stringify(value)) setRows(Object.entries(value).map(([k, v]) => ({ key: k, value: v })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const update = (next: typeof rows) => {
    setRows(next);
    onChange(Object.fromEntries(next.filter(r => r.key.trim() && r.value !== '').map(r => [r.key.trim(), r.value as string | number])));
  };
  return (
    <Input.Wrapper label={label} description={description}>
      <Stack gap={6} mt={4}>
        {rows.map((row, i) => (
          <Group key={i} gap="xs" wrap="nowrap">
            <TextInput placeholder="Key" value={row.key} style={{ flex: 1 }}
              onChange={e => update(rows.map((r, j) => j === i ? { ...r, key: e.currentTarget.value } : r))} />
            {numeric ? (
              <NumberInput value={row.value} style={{ flex: 1 }} decimalScale={6}
                onChange={v => update(rows.map((r, j) => j === i ? { ...r, value: v === '' ? '' : Number(v) } : r))} />
            ) : (
              <TextInput value={String(row.value)} style={{ flex: 1 }}
                onChange={e => update(rows.map((r, j) => j === i ? { ...r, value: e.currentTarget.value } : r))} />
            )}
            <ActionIcon variant="subtle" color="red" onClick={() => update(rows.filter((_, j) => j !== i))}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}
        <Group>
          <Button size="xs" variant="subtle" leftSection={<IconPlus size={12} />}
            onClick={() => setRows([...rows, { key: '', value: '' }])}>Add</Button>
        </Group>
      </Stack>
    </Input.Wrapper>
  );
}
