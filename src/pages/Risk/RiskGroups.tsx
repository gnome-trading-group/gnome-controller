import { Container, Group, Text, Title } from '@mantine/core';
import { useModeParam } from '../../hooks/useModeParam';
import { useActiveSessions, useGroupPositions } from '../../query/hooks';
import { ModeBand, ModeSwitch } from '../../components/trading/layout';
import { GroupPositions } from '../../components/trading/GroupPositions';

// Every strategy's open prediction-market positions netted into groups, so offsetting books across strategies show
// the firm's real worst case rather than the sum of each strategy's.
function RiskGroups() {
  const [mode, setMode] = useModeParam(undefined);
  const active = useActiveSessions();
  const live = (active.data ?? []).some(s => s.mode === mode);
  const scope = { firm: true as const, mode };
  const groups = useGroupPositions(scope, true, live);

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xs">
        <Title order={2}>Risk groups</Title>
        <ModeSwitch mode={mode} onChange={setMode} />
      </Group>
      <ModeBand mode={mode} />
      <Text size="sm" c="dimmed" mb="md">
        Open prediction-market positions across every strategy, netted by what offsets what.
      </Text>
      <GroupPositions data={groups.data} scope={scope} mode={mode} loading={groups.isLoading} basis="firm" />
    </Container>
  );
}

export default RiskGroups;
