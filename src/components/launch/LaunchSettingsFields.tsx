import { Group, Select, TextInput } from '@mantine/core';
import { LaunchSettings } from '../../utils/launch-settings';
import { instanceTypeOptions, LATENCY_PROFILE_OPTIONS, LatencyProfile } from '../../utils/sizing';
import { useLaunchSizing } from '../../hooks/useLaunchSizing';
import { strategyClassHint } from '../../utils/strategy-class';

const MODE_OPTIONS = [{ value: 'paper', label: 'Paper' }, { value: 'live', label: 'Live' }];
const STRATEGY_TYPE_OPTIONS = [{ value: 'java', label: 'Java' }, { value: 'python', label: 'Python' }];

interface Props {
  value: LaunchSettings;
  onChange: (patch: Partial<LaunchSettings>) => void;
  // Listings in the session, for sizing; where they aren't known yet (a launch rule), the number it usually has.
  listingCount: number;
  // A launch rule's sessions take their region from their venue, so it doesn't offer one.
  showRegion?: boolean;
  required?: boolean;
}

// Mode, strategy class and where and how the session runs: the same fields, hints and sizing rules for a strategy's
// defaults, a deploy and a launch rule.
export function LaunchSettingsFields({ value, onChange, listingCount, showRegion = true, required = false }: Props) {
  useLaunchSizing(value, onChange, listingCount);
  const hint = strategyClassHint(value.strategyType);
  return (
    <>
      <Group grow>
        <Select label="Mode" data={MODE_OPTIONS} value={value.mode} required={required}
          onChange={v => onChange({ mode: v ?? 'paper' })} />
        <Select label="Strategy Type" data={STRATEGY_TYPE_OPTIONS} value={value.strategyType} placeholder="Select a type"
          required={required} onChange={v => onChange({ strategyType: v })} />
      </Group>
      <TextInput label="Strategy Class" placeholder={hint.placeholder} description={hint.description} required={required}
        value={value.strategyClass} onChange={e => onChange({ strategyClass: e.currentTarget.value })} />
      <Group grow>
        {showRegion && (
          <TextInput label="Region (optional)" placeholder="e.g. us-east-1" value={value.region}
            onChange={e => onChange({ region: e.currentTarget.value })} />
        )}
        <TextInput label="Availability Zone (optional)" placeholder="Auto, or e.g. us-east-1a" value={value.availabilityZone}
          onChange={e => onChange({ availabilityZone: e.currentTarget.value })} />
      </Group>
      <Group grow>
        <Select label="Latency Profile" data={LATENCY_PROFILE_OPTIONS} value={value.latencyProfile}
          onChange={v => v && onChange({ latencyProfile: v as LatencyProfile, latencyProfileChosen: true })} />
        <Select label="Instance Type" data={instanceTypeOptions(value.latencyProfile)} value={value.instanceType}
          onChange={v => v && onChange({ instanceType: v, instanceTypeChosen: true })} />
      </Group>
      {/* Python strategies run inside the orchestrator JVM too, so they take its version as well. */}
      <Group grow>
        <TextInput label="Orchestrator Version (optional)" placeholder="Latest" value={value.orchestratorVersion}
          onChange={e => onChange({ orchestratorVersion: e.currentTarget.value })} />
        {value.strategyType === 'python' && (
          <>
            <TextInput label="Gnomepy Version (optional)" placeholder="Latest" value={value.gnomepyVersion}
              onChange={e => onChange({ gnomepyVersion: e.currentTarget.value })} />
            <TextInput label="Research Commit (optional)" placeholder="git SHA or branch (default main)" value={value.researchCommit}
              onChange={e => onChange({ researchCommit: e.currentTarget.value })} />
          </>
        )}
      </Group>
    </>
  );
}
