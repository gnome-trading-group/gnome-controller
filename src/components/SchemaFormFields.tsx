import { Checkbox, NumberInput, Select, TagsInput, Textarea, TextInput } from '@mantine/core';
import { JsonSchemaProperty } from '../types/launcher';

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
      {Object.entries(properties).map(([key, prop]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const isRequired = required.includes(key);
        const value = values[key];

        if (prop.type === 'integer') {
          return (
            <NumberInput
              key={key}
              label={label}
              description={prop.description}
              required={isRequired}
              value={value !== undefined ? (value as number) : ''}
              onChange={v => onChange(key, v === '' ? undefined : Number(v))}
              allowDecimal={false}
            />
          );
        }

        if (prop.type === 'string' && prop.enum) {
          return (
            <Select
              key={key}
              label={label}
              description={prop.description}
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
              description={prop.description}
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
              description={prop.description}
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
              description={prop.description}
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
              description={prop.description}
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
              description={prop.description ?? 'JSON object'}
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
