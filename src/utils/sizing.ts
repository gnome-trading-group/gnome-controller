// A session's sizing tier and instance type. The registry sizes a session itself when its launch names no instance
// type, from the tier and the load its listings and streams are predicted to bring (gnome-registry
// lambda/endpoints/session-sizing.ts), so the form's default is to leave the size to it.

export type Tier = 'slow' | 'standard' | 'low_latency';
// The orchestrator's profile: only low latency isolates cores, so slow and standard share one.
export type LatencyProfile = 'low_latency' | 'standard';

export const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: 'slow', label: 'Slow — tolerates tens of ms; the cheapest host that keeps every record' },
  { value: 'standard', label: 'Standard — shared cores, about a millisecond' },
  { value: 'low_latency', label: 'Low latency — dedicated cores, microseconds' },
];

/** No instance type: the registry picks one for the tier and the session's listings when it launches. */
export const AUTO_INSTANCE_TYPE = '';

interface InstanceType {
  value: string;
  vcpus: number;
  memoryGb: number;
  // CPUs a low-latency AMI isolates for hot agents; none means the size only runs the standard profile.
  isolatedCpus: number;
}

// The registry launcher's allow-list (INSTANCE_TYPES in strategy-session-launcher.ts).
export const INSTANCE_TYPES: InstanceType[] = [
  // Burstable: holds quiet sessions, but its stolen CPU turns bursts into stalls.
  { value: 't3.small', vcpus: 2, memoryGb: 2, isolatedCpus: 0 },
  { value: 't3.medium', vcpus: 2, memoryGb: 4, isolatedCpus: 0 },
  // One whole core: held every standard load to 4,000 records/s across 100 streams.
  { value: 'c7a.medium', vcpus: 1, memoryGb: 2, isolatedCpus: 0 },
  { value: 'c7a.large', vcpus: 2, memoryGb: 4, isolatedCpus: 0 },
  { value: 'c6a.large', vcpus: 2, memoryGb: 4, isolatedCpus: 0 },
  { value: 'c7i.large', vcpus: 2, memoryGb: 4, isolatedCpus: 0 },
  { value: 'c7i.xlarge', vcpus: 4, memoryGb: 8, isolatedCpus: 0 },
  { value: 'c7i.2xlarge', vcpus: 8, memoryGb: 16, isolatedCpus: 4 },
  { value: 'c7a.2xlarge', vcpus: 8, memoryGb: 16, isolatedCpus: 6 },
  { value: 'c7i.4xlarge', vcpus: 16, memoryGb: 32, isolatedCpus: 12 },
];

export function profileForTier(tier: Tier): LatencyProfile {
  return tier === 'low_latency' ? 'low_latency' : 'standard';
}

/** A tier, or a profile saved before tiers existed, as a tier; null for anything else. */
export function tierFrom(value: unknown): Tier | null {
  const text = typeof value === 'string' ? value.toLowerCase() : '';
  return text === 'slow' || text === 'standard' || text === 'low_latency' ? text : null;
}

// Live or paper: paper fills come from a simulated exchange that models its own latency, and a live strategy that needs
// microseconds asks for dedicated cores.
export const DEFAULT_TIER: Tier = 'standard';

export function instanceTypeOptions(tier: Tier): { value: string; label: string }[] {
  return [
    { value: AUTO_INSTANCE_TYPE, label: 'Auto — sized at launch from its listings' },
    ...INSTANCE_TYPES
      .filter(t => tier !== 'low_latency' || t.isolatedCpus > 0)
      .map(t => ({ value: t.value, label: `${t.value} — ${t.vcpus} vCPU, ${t.memoryGb} GB` })),
  ];
}

export function isInstanceTypeValidFor(tier: Tier, instanceType: string): boolean {
  return instanceTypeOptions(tier).some(o => o.value === instanceType);
}
