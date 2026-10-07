import { ReactNode } from 'react';
import { Accordion, Anchor, Badge, Card, Code, Group, Table, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { ConfigValue, StrategySession } from '../../types';
import { configuredListings } from '../../utils/policy-target';
import { useListingDetails } from '../../hooks/useAsyncSearch';
import { CollapsibleSection } from '../../components/CollapsibleSection';

function groupConfig(config: Record<string, ConfigValue>) {
  const params = Object.entries(config).filter(([k]) => k.startsWith('strategy.args.'));
  const strategy = Object.entries(config).filter(([k]) => k.startsWith('strategy.') && !k.startsWith('strategy.args.'));
  const simulation = Object.entries(config).filter(([k]) => k.startsWith('simulation.'));
  const overrides = Object.entries(config).filter(([k]) => k.startsWith('overrides.'));
  const paramKeys = new Set([...params, ...strategy, ...simulation, ...overrides].map(([k]) => k));
  const core = Object.entries(config).filter(([k]) => !paramKeys.has(k));

  return { core, strategy, params, simulation, overrides };
}

function renderConfigValue(v: ConfigValue): ReactNode {
  if (typeof v === 'object' && v !== null) {
    return <Code style={{ fontSize: '0.72rem' }}>{JSON.stringify(v)}</Code>;
  }
  if (typeof v === 'boolean') return String(v);
  return String(v);
}

function ConfigTable({ entries }: { entries: [string, ConfigValue][] }) {
  if (entries.length === 0) return <Text size="sm" c="dimmed">None</Text>;
  return (
    <Table striped withColumnBorders fz="xs">
      <Table.Tbody>
        {entries.map(([k, v]) => (
          <Table.Tr key={k}>
            <Table.Td style={{ fontFamily: 'monospace', width: '45%' }}>{k}</Table.Td>
            <Table.Td style={{ fontFamily: 'monospace' }}>{renderConfigValue(v)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// What the session was launched with: its listings, its config, and the machine it runs on.
export function SessionDetailsPanel({ session }: { session: StrategySession }) {
  const sessionListingIds = [...configuredListings([session])];
  const listingDetails = useListingDetails(sessionListingIds);
  const grouped = groupConfig(session.config);
  return (
    <>
    <CollapsibleSection title="Listings" storageKey="session-listings" defaultOpened={false}>
      <Card withBorder p="sm">
        {sessionListingIds.length === 0 ? (
          <Text size="sm" c="dimmed">This session's config lists no listings.</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Listing</Table.Th>
                <Table.Th>Exchange</Table.Th>
                <Table.Th>Security</Table.Th>
                <Table.Th>Exchange symbol</Table.Th>
                {session.mode === 'paper' && <Table.Th>Sim profile</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sessionListingIds.map((id) => {
                const listing = listingDetails[id];
                return (
                  <Table.Tr key={id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/security-master/listings/${id}`} size="sm">{id}</Anchor>
                    </Table.Td>
                    <Table.Td>{listing?.exchangeName ?? '—'}</Table.Td>
                    <Table.Td>{listing?.securitySymbol ?? '—'}</Table.Td>
                    <Table.Td><Code style={{ fontSize: '0.72rem' }}>{listing?.exchangeSecuritySymbol ?? '—'}</Code></Table.Td>
                    {session.mode === 'paper' && (
                      <Table.Td>{String(session.config[`simulation.listing.${id}.profile`] ?? '—')}</Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </CollapsibleSection>

    <CollapsibleSection title="Session Config" storageKey="session-config-section" defaultOpened={false}>
      <Accordion variant="contained">
        {grouped && [
          { key: 'core', label: 'Core', entries: grouped.core },
          { key: 'strategy', label: 'Strategy', entries: grouped.strategy },
          { key: 'params', label: 'Parameters', entries: grouped.params },
          { key: 'simulation', label: 'Simulation', entries: grouped.simulation },
          { key: 'overrides', label: 'Orchestrator overrides', entries: grouped.overrides },
        ].filter(s => s.entries.length > 0).map(section => (
          <Accordion.Item key={section.key} value={section.key}>
            <Accordion.Control>
              <Group gap="xs">
                <Text size="sm" fw={600}>{section.label}</Text>
                <Badge size="xs" variant="outline" color="gray">{section.entries.length}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <ConfigTable entries={section.entries} />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
        <Accordion.Item value="raw">
          <Accordion.Control><Text size="sm" fw={600}>Raw JSON</Text></Accordion.Control>
          <Accordion.Panel>
            <Code block style={{ fontSize: '0.72rem' }}>
              {JSON.stringify(session.config, null, 2)}
            </Code>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </CollapsibleSection>

    {session.instanceId && (
      <CollapsibleSection title="Compute" storageKey="session-compute">
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={760}>
            <Table withColumnBorders style={{ whiteSpace: 'nowrap' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Instance</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Latency profile</Table.Th>
                  <Table.Th>Region / AZ</Table.Th>
                  <Table.Th>Orchestrator</Table.Th>
                  <Table.Th>Gnomepy</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>
                    <Anchor
                      size="sm"
                      href={`https://${session.launchRegion}.console.aws.amazon.com/ec2/home?region=${session.launchRegion}#InstanceDetails:instanceId=${session.instanceId}`}
                      target="_blank"
                    >
                      <Code>{session.instanceId}</Code>
                    </Anchor>
                  </Table.Td>
                  <Table.Td><Code>{session.instanceType ?? '—'}</Code></Table.Td>
                  <Table.Td><Code>{String(session.config['latency.profile'] ?? '—')}</Code></Table.Td>
                  <Table.Td><Code>{session.launchRegion ?? '—'} / {session.availabilityZone ?? '—'}</Code></Table.Td>
                  <Table.Td><Code>{session.orchestratorVersion ?? '—'}</Code></Table.Td>
                  <Table.Td><Code>{session.gnomepyVersion ?? '—'}</Code></Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </CollapsibleSection>
    )}

    </>
  );
}
