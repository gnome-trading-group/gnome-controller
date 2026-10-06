import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { ActionIcon, Alert, Badge, Group, NumberInput, Select, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { registryApi } from '../utils/api';
import { errorMessage } from '../utils/kill-switch';
import { CollapsibleSection } from './CollapsibleSection';
import { Overrides } from '../utils/orchestrator-overrides';

interface PropertyCatalog {
  version: string;
  properties: Record<string, string>;
}

const SECTIONS = [
  { title: 'Journal', prefix: 'journal.' },
  { title: 'Risk', prefix: 'risk.' },
];

const isBoolean = (v: string | undefined) => v === 'true' || v === 'false';
const isNumber = (v: string | undefined) => v !== undefined && v !== '' && /^-?\d+(\.\d+)?$/.test(v);

interface OrchestratorOverridesEditorProps {
  value: Overrides;
  onChange: (value: Overrides) => void;
  // The orchestrator release the session will run; blank means latest.
  version?: string;
}

// Per-session overrides of orchestrator properties. Only properties the latest orchestrator release publishes can be
// picked, and the strategy launcher rejects anything else, so a typo can't silently do nothing.
export function OrchestratorOverridesEditor({ value, onChange, version }: OrchestratorOverridesEditorProps) {
  const [catalog, setCatalog] = useState<PropertyCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Debounced because the version is typed into a text field.
  const [debouncedVersion] = useDebouncedValue(version?.trim() || undefined, 400);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    registryApi.getOrchestratorProperties(debouncedVersion)
      .then((c) => { if (!cancelled) setCatalog(c); })
      .catch((e) => { if (!cancelled) setLoadError(errorMessage(e, 'Failed to load orchestrator properties')); });
    return () => { cancelled = true; };
  }, [debouncedVersion]);

  const properties = useMemo(() => catalog?.properties ?? {}, [catalog]);

  // Typed values are only dropped when emptied: dropping one that matches the default would wipe the field mid-typing
  // (typing 10000 passes through a 1000 default). A switch flipped back to its default is dropped, since that's
  // "no override" rather than a value still being entered.
  const set = (key: string, raw: string | null, dropIfDefault = false) => {
    const next = { ...value };
    if (raw === null || raw === '' || (dropIfDefault && raw === properties[key])) delete next[key];
    else next[key] = raw;
    onChange(next);
  };

  const sectionKeys = (prefix: string) => Object.keys(properties).filter((k) => k.startsWith(prefix)).sort();
  const inSection = (k: string) => SECTIONS.some((s) => k.startsWith(s.prefix));
  const otherOverrides = Object.keys(value).filter((k) => !inSection(k) || !(k in properties)).sort();
  const pickable = Object.keys(properties).filter((k) => !inSection(k) && !(k in value)).sort();

  const field = (key: string) => {
    const def = properties[key];
    if (isBoolean(def)) {
      return (
        <Switch
          key={key}
          label={key}
          description={`Default: ${def === 'true' ? 'on' : 'off'}`}
          checked={(value[key] ?? def) === 'true'}
          onChange={(e) => set(key, String(e.currentTarget.checked), true)}
        />
      );
    }
    if (isNumber(def)) {
      return (
        <NumberInput
          key={key}
          label={key}
          placeholder={`Default: ${def}`}
          value={value[key] ?? ''}
          onChange={(v) => set(key, v === '' ? null : String(v))}
        />
      );
    }
    return (
      <TextInput
        key={key}
        label={key}
        placeholder={def ? `Default: ${def}` : 'No default'}
        value={value[key] ?? ''}
        onChange={(e) => set(key, e.currentTarget.value)}
      />
    );
  };

  const count = Object.keys(value).length;

  return (
    <CollapsibleSection
      storageKey="orchestrator-overrides"
      defaultOpened={false}
      title={
        <Group gap="xs">
          <Title order={6}>Orchestrator settings</Title>
          {count > 0 && <Badge size="sm" variant="light">{count} overridden</Badge>}
        </Group>
      }
    >
      <Stack gap="sm">
        {loadError && (
          <Alert color="red" title="Couldn't load orchestrator properties">
            {loadError}. Existing overrides are kept, but new ones can't be picked.
          </Alert>
        )}
        {catalog && (
          <Text size="xs" c="dimmed">
            Properties and defaults from orchestrator {catalog.version}
            {debouncedVersion && catalog.version !== debouncedVersion
              ? ` (${debouncedVersion} predates per-version lists, so the latest list is shown)`
              : ''}
            .
          </Text>
        )}

        {SECTIONS.map((section) => {
          const keys = sectionKeys(section.prefix);
          if (keys.length === 0) return null;
          return (
            <Stack key={section.prefix} gap="xs">
              <Text size="sm" fw={600}>{section.title}</Text>
              {keys.map(field)}
            </Stack>
          );
        })}

        <Stack gap="xs">
          <Text size="sm" fw={600}>Other</Text>
          {otherOverrides.map((key) => (
            <Group key={key} gap="xs" align="flex-end" wrap="nowrap">
              <TextInput
                label={
                  <Group gap={4}>
                    {key}
                    {catalog && !(key in properties) && <Badge color="red" size="xs">not a property</Badge>}
                  </Group>
                }
                placeholder={properties[key] ? `Default: ${properties[key]}` : undefined}
                value={value[key]}
                onChange={(e) => onChange({ ...value, [key]: e.currentTarget.value })}
                style={{ flex: 1 }}
              />
              <ActionIcon variant="subtle" color="red" mb={4} onClick={() => set(key, null)}>
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          ))}
          <Select
            placeholder={catalog ? 'Override another property…' : 'Loading properties…'}
            data={pickable}
            searchable
            disabled={!catalog}
            value={null}
            onChange={(key) => { if (key) onChange({ ...value, [key]: properties[key] ?? '' }); }}
          />
        </Stack>
      </Stack>
    </CollapsibleSection>
  );
}
