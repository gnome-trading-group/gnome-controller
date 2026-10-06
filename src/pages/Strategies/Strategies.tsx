import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArchive, IconArchiveOff, IconEdit, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { useNavigate } from 'react-router-dom';
import { RiskPolicy, Strategy } from '../../types';
import { ACTIVE_SESSION_STATUSES, StrategySession } from '../../types/strategy-sessions';
import { runningSessionCount, strategyActivity } from '../../utils/strategy-activity';
import { registryApi } from '../../utils/api';
import { navigateRowProps } from '../../utils/navigation';
import { errorMessage } from '../../utils/kill-switch';
import StrategyFormModal from './StrategyFormModal';

function Strategies() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Strategy | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Strategy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<StrategySession[]>([]);
  const [policies, setPolicies] = useState<RiskPolicy[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [data, activeSessions, allPolicies] = await Promise.all([
        registryApi.listStrategies(showArchived ? undefined : { archived: false }),
        registryApi.listSessions({ status: ACTIVE_SESSION_STATUSES.join(',') }),
        registryApi.listRiskPolicies(),
      ]);
      setStrategies(data);
      setSessions(activeSessions);
      setPolicies(allPolicies);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e, 'Failed to load strategies'));
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggleArchived = async (strategy: Strategy) => {
    setArchiveError(null);
    try {
      await registryApi.updateStrategy(strategy.strategyId, { archived: !strategy.archived });
      refresh();
    } catch (e) {
      setArchiveError(errorMessage(e, `Failed to ${strategy.archived ? 'unarchive' : 'archive'} strategy`));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await registryApi.deleteStrategy(deleteTarget.strategyId);
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      setDeleteError(errorMessage(e, 'Failed to delete strategy'));
    }
  };

  const columns = useMemo<MRT_ColumnDef<Strategy>[]>(() => [
    {
      accessorKey: 'strategyId',
      header: 'ID',
      enableSorting: true,
      size: 60,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Strategy> }) => (
        <Group gap="xs" wrap="nowrap">
          <Text size="sm">{row.original.name}</Text>
          {row.original.archived && <Badge color="gray" variant="outline" size="xs">Archived</Badge>}
        </Group>
      ),
    },
    {
      id: 'activity',
      header: 'Status',
      accessorFn: (row) => strategyActivity(row.strategyId, sessions, policies).label,
      Cell: ({ row }: { row: MRT_Row<Strategy> }) => {
        const activity = strategyActivity(row.original.strategyId, sessions, policies);
        return <Badge color={activity.color} variant="light">{activity.label}</Badge>;
      },
    },
    {
      accessorKey: 'description',
      header: 'Description',
      enableSorting: false,
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<Strategy> }) =>
        row.original.dateCreated
          ? <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
          : '-',
    },
  ], [sessions, policies]);

  const table = useMantineReactTable({
    columns,
    data: strategies,
    state: { isLoading: loading },
    enableRowActions: true,
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    positionActionsColumn: 'last' as const,
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    mantineTableBodyRowProps: ({ row }) => navigateRowProps(navigate, `/strategies/${row.original.strategyId}`),
    initialState: { sorting: [{ id: 'strategyId', desc: false }], density: 'xs' },
    renderRowActions: ({ row }: { row: MRT_Row<Strategy> }) => {
      const strategy = row.original;
      const running = runningSessionCount(strategy.strategyId, sessions) > 0;
      const archiveLabel = strategy.archived ? 'Unarchive' : running ? 'Stop its sessions before archiving' : 'Archive';
      return (
        <Group gap={4} justify="center" wrap="nowrap">
          <ActionIcon variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); setEditTarget(strategy); setModalOpen(true); }}>
            <IconEdit size={16} />
          </ActionIcon>
          <Tooltip label={archiveLabel} withArrow openDelay={500}>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!strategy.archived && running}
              onClick={(e) => { e.stopPropagation(); toggleArchived(strategy); }}
            >
              {strategy.archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
            </ActionIcon>
          </Tooltip>
          <ActionIcon variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); setDeleteTarget(strategy); setDeleteError(null); setDeleteModalOpen(true); }}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      );
    },
  });

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Strategies</Title>
        <Group>
          <Switch
            size="xs"
            label="Show archived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.currentTarget.checked)}
          />
          <Tooltip label="Refresh" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="green" onClick={refresh}>
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Create Strategy" position="bottom" withArrow openDelay={500}>
            <ActionIcon size="lg" variant="filled" color="blue" onClick={() => { setEditTarget(null); setModalOpen(true); }}>
              <IconPlus size={20} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {loadError && (
        <Alert color="red" title="Error" mb="md">
          {loadError}
        </Alert>
      )}
      {archiveError && (
        <Alert color="red" title="Error" mb="md" withCloseButton onClose={() => setArchiveError(null)}>
          {archiveError}
        </Alert>
      )}

      <MantineReactTable table={table} />

      <StrategyFormModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
        strategy={editTarget}
      />

      <Modal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Confirm Delete" size="sm">
        <Stack>
          <Text>Delete strategy <Text span fw={500}>{deleteTarget?.name}</Text>?</Text>
          {deleteError && <Text c="red" size="sm">{deleteError}</Text>}
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button color="red" onClick={handleDelete}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default Strategies;
