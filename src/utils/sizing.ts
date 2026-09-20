export const CPU_OPTIONS = [256, 512, 1024, 2048] as const;

export const VALID_MEMORY_OPTIONS: Record<number, number[]> = {
  256: [512, 1024, 2048],
  512: [1024, 2048, 3072, 4096],
  1024: [2048, 3072, 4096, 5120, 6144, 7168, 8192],
  2048: [4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384],
};

export function suggestCollectorSizing(listingCount: number): { cpu: number; memory: number } {
  if (listingCount <= 3) return { cpu: 256, memory: 512 };
  if (listingCount <= 6) return { cpu: 512, memory: 1024 };
  if (listingCount <= 12) return { cpu: 1024, memory: 2048 };
  return { cpu: 2048, memory: 4096 };
}

export function suggestStrategySizing(listingCount: number): { cpu: number; memory: number } {
  if (listingCount <= 3) return { cpu: 256, memory: 512 };
  if (listingCount <= 6) return { cpu: 512, memory: 1024 };
  if (listingCount <= 12) return { cpu: 1024, memory: 2048 };
  return { cpu: 2048, memory: 4096 };
}
