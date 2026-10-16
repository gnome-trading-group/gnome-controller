import { useMemo, useState } from 'react';
import { Alert, Divider, MultiSelect, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useStrategies } from '../../query/hooks';
import { useListingSearch } from '../../hooks/useAsyncSearch';
import { defaultLaunchSettings, launchSettingsFrom } from '../../utils/launch-settings';
import { DirectLaunchForm } from '../../utils/direct-launch';
import { fillFromTemplate, templateFormFrom } from '../../utils/strategy-template';
import { LaunchSettingsFields } from '../../components/launch/LaunchSettingsFields';
import { StrategyArgsEditor } from '../../components/launch/StrategyArgsEditor';
import { OrchestratorOverridesEditor } from '../../components/OrchestratorOverrides';
import { SimulationSettingsEditor } from '../../components/simulation/SimulationSettingsEditor';

export function DirectLaunchFields({ value, onChange }: { value: DirectLaunchForm; onChange: (next: DirectLaunchForm) => void }) {
  const strategies = useStrategies();
  const [search, setSearch] = useState('');
  const { options, isLoading } = useListingSearch(search);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const set = (patch: Partial<DirectLaunchForm>) => onChange({ ...value, ...patch });
  const paper = value.launch.mode === 'paper';
  const strategyName = strategies.data?.find(s => String(s.strategyId) === value.strategyId)?.name ?? '';
  const listingData = useMemo(() => [
    ...Object.entries(labels).filter(([id]) => !options.some(o => o.value === id)).map(([id, l]) => ({ value: id, label: l })),
    ...options,
  ], [labels, options]);

  // A strategy's saved defaults fill the form, the way they do in a deploy.
  const chooseStrategy = (id: string | null) => {
    const template = (strategies.data?.find(s => String(s.strategyId) === id)?.parameters ?? {}) as Record<string, unknown>;
    set({
      strategyId: id,
      launch: { ...defaultLaunchSettings(), ...launchSettingsFrom(template) },
      ...fillFromTemplate({ args: value.args, overrides: value.overrides, simulation: value.simulation }, templateFormFrom(template)),
      listingIds: Array.isArray(template.listings) ? (template.listings as number[]).map(String) : value.listingIds,
    });
  };

  return (
    <Stack gap="sm">
      <Select label="Strategy" required searchable data={(strategies.data ?? []).filter(s => !s.archived)
        .map(s => ({ value: String(s.strategyId), label: s.name }))} value={value.strategyId} onChange={chooseStrategy}
        placeholder={strategies.isLoading ? 'Loading…' : 'Choose a strategy; its defaults fill in the rest'} />
      <LaunchSettingsFields value={value.launch} required showRegion={false} listingCount={value.listingIds.length}
        onChange={patch => set({ launch: { ...value.launch, ...patch }, liveConfirm: patch.mode ? '' : value.liveConfirm })} />
      <Divider />
      <StrategyArgsEditor rows={value.args} onChange={args => set({ args })} />
      <Divider />
      <MultiSelect label="Listings" placeholder="Search listings..." required searchable data={listingData}
        value={value.listingIds} searchValue={search} onSearchChange={setSearch}
        nothingFoundMessage={isLoading ? 'Loading...' : 'No listings found'}
        onChange={ids => {
          setLabels(Object.fromEntries(ids.map(id => [id, labels[id] ?? options.find(o => o.value === id)?.label ?? id])));
          set({ listingIds: ids });
        }} />
      {paper && (
        <SimulationSettingsEditor value={value.simulation} onChange={simulation => set({ simulation })}
          listingIds={value.listingIds.map(Number)} />
      )}
      <OrchestratorOverridesEditor value={value.overrides} onChange={overrides => set({ overrides })}
        version={value.launch.orchestratorVersion} />
      {!paper && (
        <Alert color="red" title="LIVE session — trades real money" icon={<IconAlertTriangle size={18} />}>
          <Text size="sm" mb="xs">Type the strategy name to confirm.</Text>
          <TextInput placeholder={strategyName} value={value.liveConfirm} onChange={e => set({ liveConfirm: e.currentTarget.value })} />
        </Alert>
      )}
    </Stack>
  );
}
