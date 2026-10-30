import { useEffect, useMemo, useState } from 'react';
import { Alert, Anchor, Skeleton, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { ContractProposition, ContractRelationship } from '../../../types';
import { registryApi } from '../../../utils/api';
import { errorMessage } from '../../../utils/kill-switch';
import UnitViews from './UnitViews';

interface SubjectViews {
  subjectId: number;
  key: string;
  propositions: ContractProposition[];
  relationships: ContractRelationship[];
}

/** The units an event's contracts belong to, with those contracts marked. The rows touching one event alone are a
 * fragment (a Kalshi strike's steps to its neighbouring strikes, which are other events), so each unit is shown
 * whole. `subjects` must be memoized by the caller: a new array reloads every view. */
export default function EventRelationshipViews({ subjects, securityIds }: {
  subjects: { subjectId: number; key: string }[];
  securityIds: number[];
}) {
  const [views, setViews] = useState<SubjectViews[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const highlight = useMemo(() => new Set(securityIds), [securityIds]);

  useEffect(() => {
    if (subjects.length === 0) return;
    let cancelled = false;
    setViews(null);
    setError(null);
    Promise.all(subjects.map(async s => ({
      ...s,
      propositions: await registryApi.listSubjectPropositions(s.subjectId),
      relationships: await registryApi.listContractRelationships({ subjectId: s.subjectId }),
    })))
      .then(v => { if (!cancelled) setViews(v); })
      .catch(e => { if (!cancelled) setError(errorMessage(e, 'Failed to load relationships')); });
    return () => { cancelled = true; };
  }, [subjects]);

  if (subjects.length === 0) return <Text size="sm" c="dimmed">No propositions for this event's contracts yet.</Text>;
  if (error) return <Alert color="red" title="Error">{error}</Alert>;
  if (!views) return <Skeleton h={200} />;

  return (
    <Stack gap="lg">
      {views.map(v => (
        <Stack key={v.subjectId} gap="xs">
          <Text size="sm">
            Subject{' '}
            <Anchor component={Link} to={`/predictions/subjects/${v.subjectId}`} ff="monospace">{v.key}</Anchor>
          </Text>
          <UnitViews propositions={v.propositions} relationships={v.relationships} highlight={highlight} onlyHighlighted />
        </Stack>
      ))}
    </Stack>
  );
}
