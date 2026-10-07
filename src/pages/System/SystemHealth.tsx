import { Container, Group, Text, Title } from '@mantine/core';
import { ServiceStatus } from '../../components/system/ServiceStatus';
import { DatabaseHealth } from '../../components/system/DatabaseHealth';
import { JobsHealth } from '../../components/system/JobsHealth';
import { QueuesHealth } from '../../components/system/QueuesHealth';
import { FleetHealth } from '../../components/system/FleetHealth';
import { DeploysHealth } from '../../components/system/DeploysHealth';

// The account's health: what's alarming, how the database is doing, whether scheduled jobs ran, queues, the trading
// fleet and deploys. Everything is discovered, so it grows with the platform. Display only; alerting is separate.
function SystemHealth() {
  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>System</Title>
        <Text size="xs" c="dimmed">Refreshes every minute</Text>
      </Group>
      <ServiceStatus />
      <DatabaseHealth />
      <JobsHealth />
      <QueuesHealth />
      <FleetHealth />
      <DeploysHealth />
    </Container>
  );
}

export default SystemHealth;
