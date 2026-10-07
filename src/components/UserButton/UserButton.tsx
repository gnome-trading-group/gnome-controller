import { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { ActionIcon, Badge, Button, Code, Group, Modal, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import classes from './UserButton.module.css';
import { DisplaySettings } from '../DisplaySettings';

type Claims = Record<string, unknown>;

// Federated users get a Cognito username like "IdentityCenter_alice"; the part after the provider is the real name.
function displayName(claims: Claims): string {
  const username = String(claims['cognito:username'] ?? '');
  const provider = (Array.isArray(claims['identities']) ? claims['identities'][0] : undefined) as { providerName?: string } | undefined;
  const prefix = provider?.providerName ? `${provider.providerName}_` : null;
  return prefix && username.startsWith(prefix) ? username.slice(prefix.length) : username;
}

function fromEpochSeconds(value: unknown): Date | null {
  return typeof value === 'number' ? new Date(value * 1000) : null;
}

function identityProvider(claims: Claims): string | null {
  const identities = claims['identities'];
  if (!Array.isArray(identities) || identities.length === 0) return null;
  const first = identities[0] as { providerName?: string; providerType?: string };
  return [first.providerName, first.providerType].filter(Boolean).join(' · ') || null;
}

function DateCell({ date }: { date: Date | null }) {
  if (!date) return <Text size="sm" c="dimmed">-</Text>;
  return (
    <Text size="sm">
      {date.toLocaleString()} (<ReactTimeAgo date={date} timeStyle="round" />)
    </Text>
  );
}

export function UserButton() {
  const [claims, setClaims] = useState<Claims | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    fetchAuthSession()
      .then((session) => setClaims((session.tokens?.idToken?.payload as Claims | undefined) ?? null))
      .catch(() => setClaims(null));
  }, [opened]);

  const name = claims ? displayName(claims) : '';
  const email = claims ? String(claims['email'] ?? '') : '';
  const groups = Array.isArray(claims?.['cognito:groups']) ? (claims!['cognito:groups'] as string[]) : [];

  const rows: [string, React.ReactNode][] = claims ? [
    ['Name', name || '-'],
    ['Email', email || '-'],
    ['Email verified', claims['email_verified'] === undefined ? '-' : String(claims['email_verified'])],
    ['Cognito username', <Code key="u">{String(claims['cognito:username'] ?? '-')}</Code>],
    ['User ID (sub)', <Code key="s">{String(claims['sub'] ?? '-')}</Code>],
    ['Signed in via', identityProvider(claims) ?? 'Cognito'],
    ['Groups', groups.length > 0 ? <Group key="g" gap={4}>{groups.map((g) => <Badge key={g} variant="light">{g}</Badge>)}</Group> : 'None'],
    ['Signed in', <DateCell key="a" date={fromEpochSeconds(claims['auth_time'])} />],
    ['Token issued', <DateCell key="i" date={fromEpochSeconds(claims['iat'])} />],
    ['Token expires', <DateCell key="e" date={fromEpochSeconds(claims['exp'])} />],
    ['User pool', <Code key="p">{String(claims['iss'] ?? '-').split('/').pop()}</Code>],
    ['App client', <Code key="c">{String(claims['aud'] ?? '-')}</Code>],
  ] : [];

  return (
    <>
      <Group gap={0} wrap="nowrap">
        <UnstyledButton className={classes.user} onClick={() => setOpened(true)}>
          <Text size="sm" fw={500} truncate>{name}</Text>
          <Text c="dimmed" size="xs" truncate>{email}</Text>
        </UnstyledButton>
        <DisplaySettings />
        <Tooltip label="Sign out" withArrow openDelay={500}>
          <ActionIcon component={Link} to="/logout" variant="subtle" color="gray" mr="md" aria-label="Sign out">
            <IconLogout size={16} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Account" size="lg">
        {claims ? (
          <Stack>
            <Table withRowBorders={false} verticalSpacing={6}>
              <Table.Tbody>
                {rows.map(([label, value]) => (
                  <Table.Tr key={label}>
                    <Table.Td w={150}><Text size="sm" c="dimmed">{label}</Text></Table.Td>
                    <Table.Td>{typeof value === 'string' ? <Text size="sm">{value}</Text> : value}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <details>
              <summary><Text span size="sm" c="dimmed">All ID token claims</Text></summary>
              <Code block mt="xs">{JSON.stringify(claims, null, 2)}</Code>
            </details>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Controller v{import.meta.env.VITE_APP_VERSION}</Text>
              <Button component={Link} to="/logout" variant="light" color="red" leftSection={<IconLogout size={16} />}>
                Sign out
              </Button>
            </Group>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">Couldn't read your session. Try signing in again.</Text>
        )}
      </Modal>
    </>
  );
}
