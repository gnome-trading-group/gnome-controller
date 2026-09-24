export const CPU_OPTIONS = [256, 512, 1024, 2048, 4096, 8192] as const;

// JVM + JPype base overhead demands 4 vCPU minimum — JIT compilation during warmup
// saturates 2 vCPU and crashes before the strategy is even running.
export const STRATEGY_CPU_OPTIONS = [4096, 8192, 16384, 32768] as const;

export const VALID_MEMORY_OPTIONS: Record<number, number[]> = {
  256: [512, 1024, 2048],
  512: [1024, 2048, 3072, 4096],
  1024: [2048, 3072, 4096, 5120, 6144, 7168, 8192],
  2048: [4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384],
  4096: [8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384, 17408, 18432, 19456, 20480, 21504, 22528, 23552, 24576, 25600, 26624, 27648, 28672, 29696, 30720],
  8192: [16384, 20480, 24576, 28672, 32768, 36864, 40960, 45056, 49152, 53248, 57344, 61440],
  16384: [32768, 40960, 49152, 57344, 65536, 73728, 81920, 90112, 98304, 106496, 114688, 122880],
  32768: [61440, 122880, 249856],
};

export function suggestCollectorSizing(listingCount: number): { cpu: number; memory: number } {
  if (listingCount <= 3) return { cpu: 256, memory: 512 };
  if (listingCount <= 6) return { cpu: 512, memory: 1024 };
  if (listingCount <= 12) return { cpu: 1024, memory: 2048 };
  return { cpu: 2048, memory: 4096 };
}

export function suggestStrategySizing(listingCount: number): { cpu: number; memory: number } {
  if (listingCount <= 3) return { cpu: 4096, memory: 8192 };
  if (listingCount <= 6) return { cpu: 4096, memory: 12288 };
  if (listingCount <= 12) return { cpu: 8192, memory: 16384 };
  return { cpu: 8192, memory: 32768 };
}
