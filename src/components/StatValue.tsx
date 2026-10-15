import type { ReactNode } from 'react';
import { Skeleton, Text } from '@mantine/core';

// Callers pass `data && <value>`, so a skeleton stands in until the data arrives (a 0 still renders).
export function StatValue({ value }: { value: ReactNode }) {
  return value == null || value === false
    ? <Skeleton h={28} w={90} mt={4} />
    : <Text size="xl" fw={700}>{value}</Text>;
}
