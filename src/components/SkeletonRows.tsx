import { Skeleton, Table } from '@mantine/core';

export function SkeletonRows({ rows = 4, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <Table.Tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <Table.Td key={c}><Skeleton h={14} w={c === 0 ? '70%' : '50%'} /></Table.Td>
          ))}
        </Table.Tr>
      ))}
    </>
  );
}
