export const CPU_OPTIONS = [256, 512, 1024, 2048, 4096, 8192] as const;

export const VALID_MEMORY_OPTIONS: Record<number, number[]> = {
  256: [512, 1024, 2048],
  512: [1024, 2048, 3072, 4096],
  1024: [2048, 3072, 4096, 5120, 6144, 7168, 8192],
  2048: [4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384],
  4096: [8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384, 17408, 18432, 19456, 20480, 21504, 22528, 23552, 24576, 25600, 26624, 27648, 28672, 29696, 30720],
  8192: [16384, 20480, 24576, 28672, 32768, 36864, 40960, 45056, 49152, 53248, 57344, 61440],
};

export function suggestCollectorSizing(listingCount: number): { cpu: number; memory: number } {
  if (listingCount <= 3) return { cpu: 256, memory: 512 };
  if (listingCount <= 6) return { cpu: 512, memory: 1024 };
  if (listingCount <= 12) return { cpu: 1024, memory: 2048 };
  return { cpu: 2048, memory: 4096 };
}

export type LatencyProfile = 'low_latency' | 'standard';

export const LATENCY_PROFILE_OPTIONS: { value: LatencyProfile; label: string }[] = [
  { value: 'low_latency', label: 'Low latency — dedicated cores' },
  { value: 'standard', label: 'Standard — shared cores, cheaper' },
];

interface InstanceType {
  value: string;
  vcpus: number;
  memoryGb: number;
  // CPUs a low-latency AMI isolates for hot threads; housekeeping keeps two cores with their sibling threads.
  isolatedCpus: number;
}

// c7i.large is offered to measure whether 2 vCPU is now enough for standard sessions: the old 4 vCPU floor came
// from JIT warmup crashing on Fargate while every agent busy-spun, which agents no longer do.
export const INSTANCE_TYPES: InstanceType[] = [
  { value: 'c7i.large', vcpus: 2, memoryGb: 4, isolatedCpus: 0 },
  { value: 'c7i.xlarge', vcpus: 4, memoryGb: 8, isolatedCpus: 0 },
  { value: 'c7i.4xlarge', vcpus: 16, memoryGb: 32, isolatedCpus: 12 },
  { value: 'c7i.8xlarge', vcpus: 32, memoryGb: 64, isolatedCpus: 28 },
  { value: 'c7i.12xlarge', vcpus: 48, memoryGb: 96, isolatedCpus: 44 },
];

export function instanceTypeOptions(profile: LatencyProfile): { value: string; label: string }[] {
  return INSTANCE_TYPES
    .filter(t => profile === 'standard' || t.isolatedCpus > 0)
    .map(t => ({ value: t.value, label: `${t.value} — ${t.vcpus} vCPU, ${t.memoryGb} GB` }));
}

/**
 * Busy-spinning threads per session, each wanting its own isolated core: per listing the socket reader plus the
 * outbound side (the simulated exchange in paper; writer and reader in live), then strategy and OMS, plus the
 * mux and router once there is more than one listing. Mirrors the orchestrator's undersize check.
 */
export function expectedHotThreads(mode: string, listingCount: number): number {
  const perListing = mode === 'live' ? 3 : 2;
  return perListing * listingCount + 2 + (listingCount > 1 ? 2 : 0);
}

export function suggestInstanceType(profile: LatencyProfile, mode: string, listingCount: number): string {
  if (profile === 'standard') return 'c7i.xlarge';
  const hot = expectedHotThreads(mode, Math.max(listingCount, 1));
  const fits = INSTANCE_TYPES.find(t => t.isolatedCpus >= hot);
  return (fits ?? INSTANCE_TYPES[INSTANCE_TYPES.length - 1]).value;
}

export function isInstanceTypeValidFor(profile: LatencyProfile, instanceType: string): boolean {
  return instanceTypeOptions(profile).some(o => o.value === instanceType);
}
