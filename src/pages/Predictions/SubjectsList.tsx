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
import { PropositionSubject, SubjectDuplicate } from '../../types';
import { registryApi } from '../../utils/api';
import { errorMessage } from '../../utils/kill-switch';
import { subjectPairKey } from '../../utils/propositions';
import { useUrlTableState } from '../../hooks/useUrlTableState';
import { MergeSubjectModal, SubjectRef } from './PropositionParts';

const PAGE_LIMIT = 500;
const DISMISSED_STORAGE_KEY = 'subjects.dismissedDuplicates';
const SIMILARITY_OPTIONS = [
  { value: '0.85', label: '≥ 85% similar' },
  { value: '0.9', label: '≥ 90% similar' },
  { value: '0.95', label: '≥ 95% similar' },
];

// Dismissals are a reviewer's own convenience, so they live in this browser only.
function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_STORAGE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(dismissed: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Storage blocked: dismissals last until the page reloads.
  }
}

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

function DuplicatesReview() {
  const [minSimilarity, setMinSimilarity] = useState('0.9');
  const [pairs, setPairs] = useState<SubjectDuplicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [merge, setMerge] = useState<{ from: SubjectRef; into: SubjectRef } | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    registryApi.listSubjectDuplicates({ minSimilarity: Number(minSimilarity) })
      .then(rows => { if (!cancelled) setPairs(rows); })
      .catch(e => { if (!cancelled) setError(errorMessage(e, 'Failed to load likely duplicates')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [minSimilarity]);

  useEffect(load, [load]);

  const dismiss = (pair: SubjectDuplicate) => {
    const next = new Set(dismissed).add(subjectPairKey(pair.subjectId, pair.candidateSubjectId));
    setDismissed(next);
    saveDismissed(next);
  };

  const visible = pairs.filter(p => !dismissed.has(subjectPairKey(p.subjectId, p.candidateSubjectId)));
  const refOf = (p: SubjectDuplicate, candidate: boolean): SubjectRef => candidate
    ? { subjectId: p.candidateSubjectId, key: p.candidateKey, propositionCount: p.candidatePropositionCount }
    : { subjectId: p.subjectId, key: p.key, propositionCount: p.propositionCount };

  const subjectCell = (id: number, key: string, description: string, count: number) => (
    <Stack gap={2}>
      <Anchor component={Link} to={`/predictions/subjects/${id}`} size="sm" ff="monospace">{key}</Anchor>
      <Text size="xs" c="dimmed">{description || 'No description'} · {count} contract{count === 1 ? '' : 's'}</Text>
    </Stack>
  );

  return (
    <Stack>
      <Group>
        <Select data={SIMILARITY_OPTIONS} value={minSimilarity} onChange={v => v && setMinSimilarity(v)}
          allowDeselect={false} style={{ width: 180 }} />
        <Tooltip label="Refresh" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="green" onClick={load} loading={loading}>
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
        {dismissed.size > 0 && (
          <Button variant="subtle" size="xs" onClick={() => { setDismissed(new Set()); saveDismissed(new Set()); }}>
            Show {dismissed.size} dismissed
          </Button>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        The newest subjects, each with its closest other subject by embedding. Merge when both name the same thing;
        dismissing only hides a pair in this browser.
      </Text>
      {error && <Alert color="red" title="Error">{error}</Alert>}
      <Paper withBorder>
        <Table striped highlightOnHover withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 90 }}>Similarity</Table.Th>
              <Table.Th>Subject</Table.Th>
              <Table.Th>Candidate</Table.Th>
              <Table.Th style={{ width: 300 }} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visible.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="dimmed" ta="center" py="md">{loading ? 'Loading…' : 'No likely duplicates.'}</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {visible.map(p => (
              <Table.Tr key={subjectPairKey(p.subjectId, p.candidateSubjectId)}>
                <Table.Td>{(p.similarity * 100).toFixed(1)}%</Table.Td>
                <Table.Td>{subjectCell(p.subjectId, p.key, p.description, p.propositionCount)}</Table.Td>
                <Table.Td>{subjectCell(p.candidateSubjectId, p.candidateKey, p.candidateDescription, p.candidatePropositionCount)}</Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Button size="compact-xs" variant="light" onClick={() => setMerge({ from: refOf(p, true), into: refOf(p, false) })}>
                      Merge into {p.key}
                    </Button>
                    <Button size="compact-xs" variant="light" onClick={() => setMerge({ from: refOf(p, false), into: refOf(p, true) })}>
                      Merge into {p.candidateKey}
                    </Button>
                    <Button size="compact-xs" variant="subtle" color="gray" onClick={() => dismiss(p)}>Dismiss</Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <MergeSubjectModal from={merge?.from ?? null} into={merge?.into ?? null} onClose={() => setMerge(null)} onMerged={load} />
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
          <Tabs.Tab value="duplicates">Likely duplicates</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="subjects"><SubjectsTable /></Tabs.Panel>
        <Tabs.Panel value="duplicates"><DuplicatesReview /></Tabs.Panel>
      </Tabs>
    </Container>
  );
}

export default SubjectsList;
