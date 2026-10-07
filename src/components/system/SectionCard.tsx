import { ReactNode } from 'react';
import { Alert, Card, Group, Loader, Text, Tooltip } from '@mantine/core';
import { RegionError } from '../../types';

// One section of the System page: its title, whether it loaded, and any regions it couldn't read, so a partial view
// never passes for a complete one.
export function SectionCard({ title, subtitle, loading, error, regionErrors, children, right }: {
  title: string;
  subtitle?: string;
  loading: boolean;
  error: unknown;
  regionErrors?: RegionError[];
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card withBorder p="md" mb="md">
      <Group justify="space-between" mb="sm">
        <div>
          <Text fw={600}>{title}</Text>
          {subtitle && <Text size="xs" c="dimmed">{subtitle}</Text>}
        </div>
        {right}
      </Group>
      {error ? (
        <Alert color="red" variant="light">Couldn't load this section: {error instanceof Error ? error.message : String(error)}</Alert>
      ) : loading ? (
        <Group justify="center" p="md"><Loader size="sm" /></Group>
      ) : children}
      {regionErrors && regionErrors.length > 0 && (
        <Tooltip label={regionErrors.map(e => `${e.region}: ${e.message}`).join('\n')} multiline w={400} withArrow>
          <Text size="xs" c="orange" mt="xs">Couldn't read {regionErrors.length} region{regionErrors.length > 1 ? 's' : ''}; this may be incomplete.</Text>
        </Tooltip>
      )}
    </Card>
  );
}
