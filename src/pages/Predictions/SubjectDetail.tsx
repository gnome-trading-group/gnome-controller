import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { Link, useParams } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import {
  ContractProposition,
  ContractRelationship,
  ContractRelationshipType,
  PropositionSubject,
  SubjectMergeLogEntry,
} from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { STORED_ROWS_NOTE, summarizeProposition } from '../../utils/propositions';
import { EvidencePanel, FlagBadges, MergeSubjectModal, SubjectRef } from './PropositionParts';
import { DerivedStatus } from './SubjectsList';
import UnitViews from './relationships/UnitViews';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  IMPLIES: 'blue',
};

interface SubjectData {
  subject: PropositionSubject | null;
  canonical: PropositionSubject | null;
  propositions: ContractProposition[];
  relationships: ContractRelationship[];
  similar: PropositionSubject[];
  history: SubjectMergeLogEntry[];
}

function SubjectDetail() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const id = Number(subjectId);
  const [data, setData] = useState<SubjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [merge, setMerge] = useState<{ from: SubjectRef; into: SubjectRef } | null>(null);
  const [unmergeOpen, setUnmergeOpen] = useState(false);
  const [unmergePending, setUnmergePending] = useState(false);
  const [unmergeError, setUnmergeError] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError(null);
    Promise.all([
      registryApi.listPropositionSubjects({ subjectIds: [id] }),
      registryApi.listSubjectPropositions(id),
      registryApi.listContractRelationships({ subjectId: id }),
      registryApi.listSimilarSubjects(id),
      registryApi.listSubjectMergeHistory(id),
    ]).then(async ([subjects, propositions, relationships, similar, history]) => {
      const subject = subjects[0] ?? null;
      const canonical = subject?.canonicalSubjectId
        ? (await registryApi.listPropositionSubjects({ subjectIds: [subject.canonicalSubjectId] }))[0] ?? null
        : null;
      if (!cancelled) setData({ subject, canonical, propositions, relationships, similar, history });
    }).catch(e => {
      if (!cancelled) setError(errorMessage(e, 'Failed to load subject'));
    });
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  const subject = data?.subject ?? null;
  const ref: SubjectRef | null = subject
    ? { subjectId: subject.subjectId, key: subject.key, propositionCount: subject.propositionCount }
    : null;

  const propositionBySecurity = useMemo(
    () => Object.fromEntries((data?.propositions ?? []).map(p => [p.securityId, p])),
    [data?.propositions],
  );

  const confirmUnmerge = async () => {
    setUnmergePending(true);
    setUnmergeError(null);
    try {
      await registryApi.unmergeSubject(id);
      setUnmergeOpen(false);
      reload();
    } catch (err) {
      setUnmergeError(errorMessage(err, 'Failed to unmerge subject'));
    } finally {
      setUnmergePending(false);
    }
  };

  const propositionColumns = useMemo<MRT_ColumnDef<ContractProposition>[]>(() => [
    {
      accessorKey: 'symbol',
      header: 'Security',
      size: 200,
      Cell: ({ row }) => (
        <Anchor component={Link} to={`/security-master/securities/${row.original.securityId}`} size="sm">
          {row.original.symbol ?? `#${row.original.securityId}`}
        </Anchor>
      ),
    },
    { accessorKey: 'exchangeCode', header: 'Venue', size: 110 },
    {
      accessorKey: 'eventTitle',
      header: 'Event',
      size: 260,
      Cell: ({ row }) => row.original.eventId ? (
        <Stack gap={0}>
          <Anchor component={Link} to={`/predictions/events/${row.original.eventId}`} size="sm">
            {row.original.eventTitle ?? `#${row.original.eventId}`}
          </Anchor>
          <Text size="xs" c="dimmed">
            {row.original.outcomeLabel}{row.original.eventResolved ? ' · resolved' : ''}
          </Text>
        </Stack>
      ) : '—',
    },
    {
      id: 'proposition',
      header: 'Proposition',
      size: 380,
      accessorFn: row => summarizeProposition(row.fields),
      Cell: ({ row }) => <Text size="sm" ff="monospace">{summarizeProposition(row.original.fields)}</Text>,
    },
    {
      accessorKey: 'method',
      header: 'Read by',
      size: 90,
      Cell: ({ row }) => (
        <Badge variant="light" size="sm" color={row.original.method === 'VENUE' ? 'teal' : 'violet'}>
          {row.original.method === 'VENUE' ? 'code' : 'llm'}
        </Badge>
      ),
    },
  ], []);

  const propositionTable = useMantineReactTable({
    columns: propositionColumns,
    data: data?.propositions ?? [],
    enableColumnFilters: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 25 } },
    renderDetailPanel: ({ row }: { row: MRT_Row<ContractProposition> }) => (
      <Table withColumnBorders fz="sm" style={{ maxWidth: 600 }}>
        <Table.Tbody>
          {Object.entries(row.original.fields).map(([k, v]) => (
            <Table.Tr key={k}>
              <Table.Td><Text size="sm" ff="monospace">{k}</Text></Table.Td>
              <Table.Td>{v === null || v === undefined ? '—' : Array.isArray(v) ? v.join(', ') || '—' : String(v)}</Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td><Text size="sm" ff="monospace">extractor_version</Text></Table.Td>
            <Table.Td>{row.original.extractorVersion}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    ),
  });

  const relationshipColumns = useMemo<MRT_ColumnDef<ContractRelationship>[]>(() => [
    {
      accessorKey: 'symbolA',
      header: 'Security A',
      Cell: ({ row }) => (
        <Anchor component={Link} to={`/security-master/securities/${row.original.securityIdA}`} size="sm">
          {row.original.symbolA ?? `#${row.original.securityIdA}`}
        </Anchor>
      ),
    },
    {
      accessorKey: 'relationshipType',
      header: 'Type',
      size: 110,
      Cell: ({ row }) => (
        <Badge color={RELATIONSHIP_COLORS[row.original.relationshipType] ?? 'gray'} variant="light" size="sm">
          {row.original.relationshipType}
        </Badge>
      ),
    },
    {
      accessorKey: 'symbolB',
      header: 'Security B',
      Cell: ({ row }) => (
        <Anchor component={Link} to={`/security-master/securities/${row.original.securityIdB}`} size="sm">
          {row.original.symbolB ?? `#${row.original.securityIdB}`}
        </Anchor>
      ),
    },
    { accessorKey: 'flags', header: 'Flags', size: 180, Cell: ({ row }) => <FlagBadges flags={row.original.flags} /> },
    { accessorKey: 'method', header: 'Method', size: 90 },
  ], []);

  const relationshipTable = useMantineReactTable({
    columns: relationshipColumns,
    data: data?.relationships ?? [],
    enableColumnFilters: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 25 } },
    renderDetailPanel: ({ row }: { row: MRT_Row<ContractRelationship> }) => (
      <EvidencePanel
        evidence={row.original.evidence}
        labelA={propositionBySecurity[row.original.securityIdA]?.symbol ?? row.original.symbolA ?? 'A'}
        labelB={propositionBySecurity[row.original.securityIdB]?.symbol ?? row.original.symbolB ?? 'B'}
      />
    ),
  });

  if (error) {
    return <Container size="xl" py="xl"><Alert color="red" title="Error">{error}</Alert></Container>;
  }
  if (!data) {
    return <Container size="xl" py="xl"><Skeleton h={400} /></Container>;
  }
  if (!subject || !ref) {
    return <Container size="xl" py="xl"><Alert color="yellow" title="Not found">No subject {subjectId}.</Alert></Container>;
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Stack gap={4}>
          <Anchor component={Link} to="/predictions/subjects" size="sm">← Subjects</Anchor>
          <Group gap="sm">
            <Title order={2} ff="monospace">{subject.key}</Title>
            <DerivedStatus subject={subject} />
          </Group>
          <Text c="dimmed">{subject.description || 'No description'}</Text>
        </Stack>

        {data.canonical && (
          <Alert color="blue" title="Merged">
            <Group justify="space-between">
              <Text size="sm">
                This subject is merged into{' '}
                <Anchor component={Link} to={`/predictions/subjects/${data.canonical.subjectId}`} ff="monospace">
                  {data.canonical.key}
                </Anchor>
                ; its contracts are derived there.
              </Text>
              <Button size="xs" variant="light" onClick={() => { setUnmergeError(null); setUnmergeOpen(true); }}>
                Unmerge
              </Button>
            </Group>
          </Alert>
        )}

        <Stack gap="xs">
          <Title order={4}>Contracts ({data.propositions.length})</Title>
          <MantineReactTable table={propositionTable} />
        </Stack>

        <Stack gap="xs">
          <Title order={4}>Relationships by unit</Title>
          <Text size="sm" c="dimmed">
            Contracts in different units (snapshots at different times, deadlines on different events) never relate,
            so each is shown on its own: a strike ladder as a table, anything else as a graph.
          </Text>
          <UnitViews propositions={data.propositions} relationships={data.relationships} />
        </Stack>

        <Stack gap="xs">
          <Title order={4}>Stored relationships ({data.relationships.length})</Title>
          <Text size="sm" c="dimmed">{STORED_ROWS_NOTE} Expand a row to see the rule and the fields it compared.</Text>
          <MantineReactTable table={relationshipTable} />
        </Stack>

        {!data.canonical && (
          <Stack gap="xs">
            <Title order={4}>Similar subjects</Title>
            {!subject.hasEmbedding && (
              <Text size="sm" c="dimmed">This subject has no embedding yet, so similar subjects can't be found.</Text>
            )}
            {subject.hasEmbedding && data.similar.length === 0 && <Text size="sm" c="dimmed">None.</Text>}
            {data.similar.length > 0 && (
              <Paper withBorder>
                <Table striped withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 90 }}>Similarity</Table.Th>
                      <Table.Th>Subject</Table.Th>
                      <Table.Th style={{ width: 90 }}>Contracts</Table.Th>
                      <Table.Th style={{ width: 280 }} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.similar.map(s => {
                      const other: SubjectRef = { subjectId: s.subjectId, key: s.key, propositionCount: s.propositionCount };
                      return (
                        <Table.Tr key={s.subjectId}>
                          <Table.Td>{s.similarity === undefined ? '—' : `${(s.similarity * 100).toFixed(1)}%`}</Table.Td>
                          <Table.Td>
                            <Anchor component={Link} to={`/predictions/subjects/${s.subjectId}`} size="sm" ff="monospace">
                              {s.key}
                            </Anchor>
                            <Text size="xs" c="dimmed">{s.description || 'No description'}</Text>
                          </Table.Td>
                          <Table.Td>{s.propositionCount}</Table.Td>
                          <Table.Td>
                            <Group gap={6} wrap="nowrap">
                              <Button size="compact-xs" variant="light" onClick={() => setMerge({ from: other, into: ref })}>
                                Merge into this
                              </Button>
                              <Button size="compact-xs" variant="subtle" onClick={() => setMerge({ from: ref, into: other })}>
                                Merge this into it
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Paper>
            )}
          </Stack>
        )}

        <Stack gap="xs">
          <Title order={4}>Merge history</Title>
          {data.history.length === 0 ? <Text size="sm" c="dimmed">Never merged.</Text> : (
            <Paper withBorder>
              <Table striped withColumnBorders fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>When</Table.Th>
                    <Table.Th>Change</Table.Th>
                    <Table.Th>By</Table.Th>
                    <Table.Th>Propositions moved</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.history.map(h => (
                    <Table.Tr key={h.mergeLogId}>
                      <Table.Td><ReactTimeAgo date={new Date(h.dateCreated)} timeStyle="round" /></Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light" color={h.action === 'MERGE' ? 'blue' : 'gray'} mr={6}>
                          {h.action.toLowerCase()}
                        </Badge>
                        <Anchor component={Link} to={`/predictions/subjects/${h.aliasSubjectId}`} ff="monospace" size="sm">
                          {h.aliasKey}
                        </Anchor>
                        {h.action === 'MERGE' ? ' into ' : ' from '}
                        <Anchor component={Link} to={`/predictions/subjects/${h.canonicalSubjectId}`} ff="monospace" size="sm">
                          {h.canonicalKey}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>{h.actor}</Table.Td>
                      <Table.Td>{h.propositionsMoved}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </Stack>
      </Stack>

      <MergeSubjectModal from={merge?.from ?? null} into={merge?.into ?? null} onClose={() => setMerge(null)} onMerged={reload} />

      <Modal opened={unmergeOpen} onClose={() => { if (!unmergePending) setUnmergeOpen(false); }} title="Unmerge subject" size="md">
        <Stack>
          <Text size="sm">
            Unmerge <Text span fw={600} ff="monospace">{subject.key}</Text>
            {data.canonical && <> from <Text span fw={600} ff="monospace">{data.canonical.key}</Text></>}? The
            propositions extracted as {subject.key} move back to it, and both subjects are re-derived.
          </Text>
          {unmergeError && <Text c="red" size="sm">{unmergeError}</Text>}
          <Group justify="flex-end">
            <Button variant="default" disabled={unmergePending} onClick={() => setUnmergeOpen(false)}>Cancel</Button>
            <Button loading={unmergePending} onClick={confirmUnmerge}>Unmerge</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default SubjectDetail;
