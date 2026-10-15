import { Checkbox, NumberInput, Select, TagsInput, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import dayjs from 'dayjs';
import { JsonSchemaProperty } from '../types/jsonSchema';

// An optional field (anyOf [field, null]) renders as the field itself, keeping the outer description and default.
function resolve(prop: JsonSchemaProperty): JsonSchemaProperty {
  const option = prop.anyOf?.find(o => o.type !== 'null');
  return option ? { ...option, description: prop.description, default: prop.default } : prop;
}

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

        if (prop.type === 'object') {
          const jsonStr = value ? JSON.stringify(value, null, 2) : '';
          return (
            <Textarea
              key={key}
              label={label}
              description={description ?? 'JSON object'}
              required={isRequired}
              value={jsonStr}
              minRows={3}
              autosize
              onChange={e => {
                const raw = e.target.value.trim();
                if (!raw) { onChange(key, undefined); return; }
                try { onChange(key, JSON.parse(raw)); } catch { /* ignore while typing */ }
              }}
            />
          );
        }

        return null;
      })}
    </>
  );
}
