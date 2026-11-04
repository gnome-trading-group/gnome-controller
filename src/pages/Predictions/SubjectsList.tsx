import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconRefresh, IconSearch } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import { PropositionSubject, SubjectMergeCandidate } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { useUrlTableState } from '../../hooks/useUrlTableState';

const PAGE_LIMIT = 500;
const QUEUE_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'MERGED', label: 'Merged' },
  { value: 'DISMISSED', label: 'Dismissed' },
  { value: 'ALL', label: 'All' },
];
const HOLD_LABELS: Record<SubjectMergeCandidate['hold'], string> = {
  PRICE: 'books cross',
  COLLISION: 'outcomes collide',
};

export function DerivedStatus({ subject }: { subject: Pick<PropositionSubject, 'derivedAt' | 'dateModified'> }) {
  if (!subject.derivedAt || new Date(subject.dateModified) > new Date(subject.derivedAt)) {
    return <Badge color="yellow" variant="light" size="sm">awaiting derivation</Badge>;
  }
  return <Text span size="sm"><ReactTimeAgo date={new Date(subject.derivedAt)} timeStyle="round" /></Text>;
}

function SubjectsTable() {
  const urlState = useUrlTableState({ defaultSort: { id: 'key', desc: false } });
  const search = urlState.getParam('search') ?? '';
  const includeMerged = urlState.getParam('merged') === 'true';
  const dirtyOnly = urlState.getParam('dirty') === 'true';
  const [searchInput, setSearchInput] = useState(search);
  const [debouncedSearch] = useDebouncedValue(searchInput, 300);
  const [subjects, setSubjects] = useState<PropositionSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { setParam } = urlState;
  useEffect(() => {
    if (debouncedSearch !== search) setParam('search', debouncedSearch);
  }, [debouncedSearch, search, setParam]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    registryApi.listPropositionSubjects({ search: search || undefined, canonical: !includeMerged, dirty: dirtyOnly, limit: PAGE_LIMIT })
      .then(rows => { if (!cancelled) setSubjects(rows); })
      .catch(e => { if (!cancelled) setError(errorMessage(e, 'Failed to load subjects')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, includeMerged, dirtyOnly, reloadKey]);

  const keyById = useMemo(() => Object.fromEntries(subjects.map(s => [s.subjectId, s.key])), [subjects]);

  const columns = useMemo<MRT_ColumnDef<PropositionSubject>[]>(() => [
    {
      accessorKey: 'key',
      header: 'Subject',
      Cell: ({ row }) => (
        <Anchor component={Link} to={`/predictions/subjects/${row.original.subjectId}`} size="sm" ff="monospace">
          {row.original.key}
        </Anchor>
      ),
    },
    { accessorKey: 'description', header: 'Description', size: 320 },
    { accessorKey: 'propositionCount', header: 'Contracts', size: 100 },
    {
      accessorKey: 'canonicalSubjectId',
      header: 'Merged into',
      size: 160,
      Cell: ({ row }) => row.original.canonicalSubjectId === null ? '' : (
        <Anchor component={Link} to={`/predictions/subjects/${row.original.canonicalSubjectId}`} size="sm" ff="monospace">
          {keyById[row.original.canonicalSubjectId] ?? `#${row.original.canonicalSubjectId}`}
        </Anchor>
      ),
    },
    {
      accessorKey: 'derivedAt',
      header: 'Derived',
      size: 150,
      Cell: ({ row }) => <DerivedStatus subject={row.original} />,
    },
  ], [keyById]);

  const table = useMantineReactTable({
    columns,
    data: subjects,
    state: { isLoading: loading, sorting: urlState.sorting, pagination: urlState.pagination },
    onSortingChange: urlState.setSorting,
    onPaginationChange: urlState.setPagination,
    enableColumnFilters: false,
    enableGlobalFilter: false,
    enableTopToolbar: false,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    initialState: { density: 'xs' },
  });

  return (
    <Stack>
      <Group>
        <TextInput
          placeholder="Search key or description"
          leftSection={<IconSearch size={16} />}
          value={searchInput}
          onChange={e => setSearchInput(e.currentTarget.value)}
          style={{ width: 320 }}
        />
        <Switch label="Include merged" checked={includeMerged}
          onChange={e => urlState.setParam('merged', e.currentTarget.checked ? 'true' : '')} />
        <Switch label="Awaiting derivation only" checked={dirtyOnly}
          onChange={e => urlState.setParam('dirty', e.currentTarget.checked ? 'true' : '')} />
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={() => setReloadKey(k => k + 1)} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {error && <Alert color="red" title="Error">{error}</Alert>}
      {subjects.length === PAGE_LIMIT && (
        <Text size="sm" c="dimmed">Showing the first {PAGE_LIMIT} subjects by key; search to narrow them down.</Text>
      )}
      <MantineReactTable table={table} />
    </Stack>
  );
}

function SubjectLink({ id, subjectKey }: { id: number; subjectKey: string }) {
  return <Anchor component={Link} to={`/predictions/subjects/${id}`} size="sm" ff="monospace">{subjectKey}</Anchor>;
}

function HoldDetails({ candidate }: { candidate: SubjectMergeCandidate }) {
  const { prices, collisions, entityMap } = candidate.details;
  return (
    <Stack gap={2}>
      {(prices ?? []).slice(0, 3).map(p => (
        <Text key={`${p.securityIdA}-${p.securityIdB}`} size="xs">
          {p.relationshipType === 'EQUIVALENT' ? '≡' : '⇒'}{' '}
          <Anchor component={Link} to={`/security-master/securities/${p.bidSecurityId}`} size="xs">{p.bidSecurityId}</Anchor>
          {' '}bid {p.bid.toFixed(2)} above{' '}
          <Anchor component={Link} to={`/security-master/securities/${p.askSecurityId}`} size="xs">{p.askSecurityId}</Anchor>
          {' '}ask {p.ask.toFixed(2)}
        </Text>
      ))}
      {(prices?.length ?? 0) > 3 && <Text size="xs" c="dimmed">and {prices!.length - 3} more</Text>}
      {Object.entries(collisions ?? {}).map(([eventId, ids]) => (
        <Text key={eventId} size="xs">event {eventId}: securities {ids.join(', ')} would read alike</Text>
      ))}
      {(entityMap?.length ?? 0) > 0 && (
        <Text size="xs" c="dimmed">renames {entityMap!.map(([keep, alias]) => `${alias} → ${keep}`).join(', ')}</Text>
      )}
    </Stack>
  );
}

function MergeQueue() {
  const [status, setStatus] = useState<string>('PENDING');
  const [rows, setRows] = useState<SubjectMergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<number | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    registryApi.listSubjectMergeCandidates(status as SubjectMergeCandidate['status'] | 'ALL')
      .then(r => { if (!cancelled) setRows(r); })
      .catch(e => { if (!cancelled) setError(errorMessage(e, 'Failed to load the merge queue')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status]);

  useEffect(load, [load]);

  const decide = (candidate: SubjectMergeCandidate, decision: 'MERGED' | 'DISMISSED') => {
    setDeciding(candidate.candidateId);
    setError(null);
    registryApi.decideSubjectMergeCandidate(candidate.candidateId, decision)
      .then(load)
      .catch(e => setError(errorMessage(e, decision === 'MERGED' ? 'Merge failed' : 'Dismiss failed')))
      .finally(() => setDeciding(null));
  };

  return (
    <Stack>
      <Group>
        <Select data={QUEUE_STATUS_OPTIONS} value={status} onChange={v => v && setStatus(v)} allowDeselect={false}
          style={{ width: 160 }} />
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={load} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Text size="sm" c="dimmed">
        Merges the classifier judged right but did not make: two venues' prices for a relationship the merge adds
        disagree, or two outcomes of one event would read alike. Merge when the prices are wrong (a stale or one-sided
        book) and the subjects really are the same; otherwise mark them not the same, and they won't come back.
      </Text>
      {error && <Alert color="red" title="Error">{error}</Alert>}
      <Paper withBorder>
        <Table striped highlightOnHover withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Merge</Table.Th>
              <Table.Th style={{ width: 70 }}>Adds</Table.Th>
              <Table.Th>Why the judge says they're the same</Table.Th>
              <Table.Th>Held because</Table.Th>
              <Table.Th style={{ width: 220 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed" ta="center" py="md">{loading ? 'Loading…' : 'Nothing in the queue.'}</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map(c => (
              <Table.Tr key={c.candidateId}>
                <Table.Td>
                  <Stack gap={2}>
                    <SubjectLink id={c.aliasSubjectId} subjectKey={c.aliasKey} />
                    <Text size="xs" c="dimmed">into</Text>
                    <SubjectLink id={c.canonicalSubjectId} subjectKey={c.canonicalKey} />
                  </Stack>
                </Table.Td>
                <Table.Td>{c.gain}</Table.Td>
                <Table.Td><Text size="sm">{c.reason}</Text></Table.Td>
                <Table.Td>
                  <Stack gap={4}>
                    <Badge color={c.hold === 'PRICE' ? 'orange' : 'red'} variant="light" size="sm">{HOLD_LABELS[c.hold]}</Badge>
                    <HoldDetails candidate={c} />
                  </Stack>
                </Table.Td>
                <Table.Td>
                  {c.status === 'PENDING' ? (
                    <Group gap={6} wrap="nowrap">
                      <Button size="compact-xs" variant="light" loading={deciding === c.candidateId}
                        onClick={() => decide(c, 'MERGED')}>Merge</Button>
                      <Button size="compact-xs" variant="subtle" color="gray" disabled={deciding === c.candidateId}
                        onClick={() => decide(c, 'DISMISSED')}>Not the same</Button>
                    </Group>
                  ) : (
                    <Text size="xs" c="dimmed">
                      {c.status === 'MERGED' ? 'Merged' : 'Dismissed'} by {c.decidedBy}
                      {c.decidedAt && <> <ReactTimeAgo date={new Date(c.decidedAt)} timeStyle="round" /></>}
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}

function SubjectsList() {
  const urlState = useUrlTableState({});
  const tab = urlState.getParam('tab') || 'subjects';

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="xs">Subjects</Title>
      <Text size="sm" c="dimmed" mb="md">
        What each contract's proposition is about. Relationships are derived between contracts that share a subject, so
        merging two subjects that name the same thing relates their contracts.
      </Text>
      <Tabs value={tab} onChange={v => urlState.setParam('tab', v === 'subjects' ? '' : v ?? '')}>
        <Tabs.List mb="md">
          <Tabs.Tab value="subjects">Subjects</Tabs.Tab>
          <Tabs.Tab value="queue">Merge queue</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="subjects"><SubjectsTable /></Tabs.Panel>
        <Tabs.Panel value="queue"><MergeQueue /></Tabs.Panel>
      </Tabs>
    </Container>
  );
}

export default SubjectsList;
