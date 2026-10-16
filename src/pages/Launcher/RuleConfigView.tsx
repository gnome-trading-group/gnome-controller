import { ReactNode, useState } from 'react';
import { Anchor, Badge, Card, Code, Group, JsonInput, SimpleGrid, Stack, Switch, Table, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { LaunchRule, RuleType } from '../../types/launcher';
import { useStrategyName } from '../../query/hooks';
import { SimulationSummary } from '../../components/simulation/SimulationSummary';
import { toSessionSimulation } from '../../utils/simulation';
import { ModeBadge } from '../../components/trading/layout';

const OWN = new Set(['strategy_id', 'strategy_type', 'strategy_class', 'mode', 'research_commit', 'instance_type',
  'latency_profile', 'orchestrator_version', 'gnomepy_version', 'availability_zone', 'strategy_args', 'simulation',
  'overrides']);
const RESEARCH_REPO = 'https://github.com/gnome-trading-group/gnomepy-research';

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    // Fixed layout, and values may break anywhere: a class path or JSON value has no spaces to wrap at, and would
    // otherwise push the table out of its card.
    <Table withRowBorders={false} verticalSpacing={4} fz="sm" layout="fixed">
      <Table.Tbody>
        {rows.map(([label, value]) => (
          <Table.Tr key={label}>
            <Table.Td c="dimmed" w="45%" style={{ verticalAlign: 'top' }}>{label}</Table.Td>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>{value ?? <Text span c="dimmed">—</Text>}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card withBorder padding="sm">
      <Text fw={600} size="sm" mb={4}>{title}</Text>
      {children}
    </Card>
  );
}

function show(value: unknown): ReactNode {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return <Group gap={4}>{value.map(v => <Badge key={String(v)} variant="light" size="sm">{String(v)}</Badge>)}</Group>;
  if (typeof value === 'object') {
    return (
      <Stack gap={0}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <Text key={k} size="sm"><Text span c="dimmed">{k}</Text> {JSON.stringify(v)}</Text>
        ))}
      </Stack>
    );
  }
  return String(value);
}

export function RuleConfigView({ rule, ruleType }: { rule: LaunchRule; ruleType: RuleType | undefined }) {
  const [raw, setRaw] = useState(false);
  const p = rule.parameters;
  const strategyId = p.strategy_id as number | undefined;
  const strategyName = useStrategyName(strategyId);
  const typeKeys = Object.keys(ruleType?.parameter_schema.properties ?? {}).filter(k => !OWN.has(k));
  const commit = p.research_commit as string | undefined;

  return (
    <Stack gap="sm">
      <Group justify="flex-end">
        <Switch size="xs" label="Raw JSON" checked={raw} onChange={e => setRaw(e.currentTarget.checked)} />
      </Group>
      {raw ? (
        <JsonInput value={JSON.stringify(rule, null, 2)} readOnly autosize minRows={10} />
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <Section title="Behaviour">
              <Facts rows={[
                ['Launches', rule.launch_path === 'auto' ? 'Automatic' : 'Need approval'],
                ['Shutdowns', rule.shutdown_path === 'auto' ? 'Automatic' : 'Need approval'],
                ['Scheduled by rule type', rule.schedule_enabled ? 'Yes' : 'No'],
                ['Max concurrent sessions', rule.max_concurrent_sessions ?? 'No cap'],
                ['Cooldown', rule.cooldown_minutes ? `${rule.cooldown_minutes} min` : 'None'],
                ['Dedup window', `${rule.dedup_window_minutes} min`],
              ]} />
            </Section>
            <Section title="Strategy">
              <Facts rows={[
                ['Strategy', strategyId != null
                  ? <Anchor component={Link} to={`/strategies/${strategyId}`} size="sm">{strategyName ?? `#${strategyId}`}</Anchor> : null],
                ['Mode', p.mode ? <ModeBadge mode={String(p.mode)} size="sm" /> : null],
                ['Class', p.strategy_class ? <Code>{String(p.strategy_class)}</Code> : null],
                ['Type', show(p.strategy_type)],
                ['Research commit', commit
                  ? <Anchor href={`${RESEARCH_REPO}/commit/${commit}`} target="_blank" size="sm" ff="monospace">{commit.slice(0, 10)}</Anchor>
                  : <Text span size="sm" c="orange">main at launch time</Text>],
              ]} />
            </Section>
            <Section title="Compute">
              <Facts rows={[
                ['Instance type', show(p.instance_type) ?? 'Default'],
                ['Latency profile', show(p.latency_profile) ?? 'Default'],
                ['Availability zone', show(p.availability_zone) ?? 'Any'],
                ['Orchestrator', show(p.orchestrator_version) ?? 'Latest'],
                ['gnomepy', show(p.gnomepy_version) ?? 'Latest'],
              ]} />
            </Section>
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {typeKeys.length > 0 && (
              <Section title={ruleType?.display_name ?? rule.rule_type}>
                <Facts rows={typeKeys.map(k => [k.replace(/_/g, ' '), show(p[k]) ?? (
                  ruleType?.parameter_schema.properties?.[k]?.default !== undefined
                    ? <Text span size="sm" c="dimmed">default {JSON.stringify(ruleType.parameter_schema.properties[k].default)}</Text>
                    : null)])} />
              </Section>
            )}
            <Section title="Strategy args">
              {p.strategy_args && Object.keys(p.strategy_args as object).length
                ? <Facts rows={Object.entries(p.strategy_args as Record<string, unknown>).map(([k, v]) => [k, <Code key={k}>{JSON.stringify(v)}</Code>])} />
                : <Text size="sm" c="dimmed">None: sessions get only what the rule type adds per trigger.</Text>}
            </Section>
            {!!p.overrides && Object.keys(p.overrides as object).length > 0 && (
              <Section title="Orchestrator overrides">
                <Facts rows={Object.entries(p.overrides as Record<string, string>).map(([k, v]) => [k, <Code key={k}>{v}</Code>])} />
              </Section>
            )}
          </SimpleGrid>
          {p.mode === 'paper' && (
            <Section title="Simulation">
              <SimulationSummary simulation={toSessionSimulation(p.simulation)} />
            </Section>
          )}
        </>
      )}
    </Stack>
  );
}
