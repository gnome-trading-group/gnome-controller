import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Switch, Text, Tooltip } from '@mantine/core';
import { IconHistory, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, MRT_ColumnDef, MRT_Row, useMantineReactTable } from 'mantine-react-table';
import { RiskPolicy, StrategySession } from '../../types';
import { registryApi } from '../../utils/api';
import { formatRiskParameters } from '../../utils/risk-parameters';
import { KILL_SWITCH_TYPE, listingKills } from '../../utils/kill-switch';
import {
  configuredListings, describeTarget, isActiveSessionStatus, isUnrelatedListingPolicy, policyLevel,
} from '../../utils/policy-target';
import { useListingLabels } from '../../hooks/useAsyncSearch';
import { ReasonConfirmModal } from '../ReasonConfirmModal';
import { RiskPolicyHistoryModal } from '../RiskPolicyHistoryModal';
import { KillOnListingModal } from '../KillOnListingModal';
import { ListingKillList } from '../ListingKillList';
import { AddRiskPolicyModal } from '../AddRiskPolicyModal';
import { EditRiskPolicyModal } from '../EditRiskPolicyModal';

interface StrategyRiskPanelProps {
  strategyId: number;
  strategyName: string | undefined;
  // This strategy's policies, without those of its ended sessions.
  policies: RiskPolicy[];
  policiesLoaded: boolean;
  sessions: StrategySession[];
  loading: boolean;
  onChanged: () => void;
}

// The strategy's risk policies: those that apply to it, its listing kills, and adding, editing and removing them.
export function StrategyRiskPanel({
  strategyId, strategyName, policies, policiesLoaded, sessions, loading, onChanged,
}: StrategyRiskPanelProps) {
  const [createPolicyOpen, setCreatePolicyOpen] = useState(false);
  const [deletePolicyTarget, setDeletePolicyTarget] = useState<RiskPolicy | null>(null);
  const [toggleTarget, setToggleTarget] = useState<RiskPolicy | null>(null);
  const [editPolicyTarget, setEditPolicyTarget] = useState<RiskPolicy | null>(null);
  const [historyTarget, setHistoryTarget] = useState<RiskPolicy | null>(null);
  const [killOnListingOpen, setKillOnListingOpen] = useState(false);
  const [showAllListingPolicies, setShowAllListingPolicies] = useState(false);

  const tradedListings = useMemo(
    () => configuredListings(sessions.filter((s) => isActiveSessionStatus(s.status))),
    [sessions],
  );
  const hiddenListingPolicies = policies.filter((p) => isUnrelatedListingPolicy(p, tradedListings)).length;
  const shownPolicies = useMemo(
    () => (showAllListingPolicies ? policies : policies.filter((p) => !isUnrelatedListingPolicy(p, tradedListings))),
    [policies, tradedListings, showAllListingPolicies],
  );
  const listingLabels = useListingLabels(shownPolicies.flatMap((p) => (p.listingId != null ? [p.listingId] : [])));

  const confirmToggleEnabled = async (reason: string | undefined) => {
    if (!toggleTarget) return;
    await registryApi.updateRiskPolicy(toggleTarget.policyId, { enabled: !toggleTarget.enabled, reason });
    onChanged();
  };

  const confirmDeletePolicy = async (reason: string | undefined) => {
    if (!deletePolicyTarget) return;
    await registryApi.deleteRiskPolicy(deletePolicyTarget.policyId, reason);
    onChanged();
  };

  const policyColumns = useMemo<MRT_ColumnDef<RiskPolicy>[]>(() => [
    { accessorKey: 'policyId', header: 'ID', enableSorting: true, size: 60 },
    {
      id: 'level',
      header: 'Level',
      size: 90,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) => {
        const level = policyLevel(row.original);
        return <Badge color={level.color} variant="outline">{level.label}</Badge>;
      },
    },
    { accessorKey: 'policyType', header: 'Type', enableSorting: true },
    {
      id: 'appliesTo',
      header: 'Applies to',
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) =>
        describeTarget(row.original, () => strategyName, (listingId) => listingLabels[listingId]),
    },
    {
      id: 'parameters',
      header: 'Limits',
      enableSorting: false,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) => formatRiskParameters(row.original.parameters),
    },
    {
      accessorKey: 'enabled',
      header: 'Enabled',
      size: 80,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) => (
        <Switch
          checked={row.original.enabled}
          // Global and listing-wide policies cover other strategies too; they're changed from the Risk page.
          disabled={row.original.strategyId == null}
          onChange={() => setToggleTarget(row.original)}
        />
      ),
    },
    {
      accessorKey: 'dateModified',
      header: 'Modified',
      enableSorting: true,
      Cell: ({ row }: { row: MRT_Row<RiskPolicy> }) =>
        row.original.dateModified
          ? <ReactTimeAgo date={new Date(row.original.dateModified)} timeStyle="round" />
          : '-',
    },
  ], [strategyName, listingLabels]);

  const policyTable = useMantineReactTable({
    columns: policyColumns,
    data: shownPolicies,
    state: { isLoading: loading },
    enableEditing: false,
    enableRowActions: true,
    enableColumnFilters: false,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    positionActionsColumn: 'last' as const,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
    renderRowActions: ({ row }: { row: MRT_Row<RiskPolicy> }) => (
      <Group gap={4} justify="center" wrap="nowrap">
        <Tooltip label="History" withArrow openDelay={500}>
          <ActionIcon variant="subtle" color="blue" onClick={() => setHistoryTarget(row.original)}>
            <IconHistory size={16} />
          </ActionIcon>
        </Tooltip>
        {row.original.policyType !== KILL_SWITCH_TYPE && (
          <Tooltip label="Edit limits" withArrow openDelay={500}>
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={row.original.strategyId == null}
              onClick={() => setEditPolicyTarget(row.original)}
            >
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon
          variant="subtle"
          color="red"
          disabled={row.original.strategyId == null}
          onClick={() => setDeletePolicyTarget(row.original)}
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    ),
  });

  return (
    <>
      <Group justify="flex-end" mb="xs" gap="xs">
        <Switch
          size="xs"
          label={`Show all listing policies${hiddenListingPolicies ? ` (${hiddenListingPolicies} hidden)` : ''}`}
          checked={showAllListingPolicies}
          onChange={(e) => setShowAllListingPolicies(e.currentTarget.checked)}
        />
        <Button size="xs" variant="light" color="red" disabled={!policiesLoaded} onClick={() => setKillOnListingOpen(true)}>
          Kill on listing
        </Button>
        <Tooltip label="Add a policy for this strategy" withArrow openDelay={500}>
          <ActionIcon size="lg" variant="filled" color="blue" onClick={() => setCreatePolicyOpen(true)}>
            <IconPlus size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <ListingKillList
        kills={listingKills(policies)}
        describe={(p) => describeTarget(p, () => strategyName, (listingId) => listingLabels[listingId])}
        level={policyLevel}
        onResumed={onChanged}
      />
      <MantineReactTable table={policyTable} />

      <KillOnListingModal
        opened={killOnListingOpen}
        onClose={() => setKillOnListingOpen(false)}
        target={{ strategyId }}
        targetLabel={`every session of strategy ${strategyName ?? strategyId}`}
        policies={policies}
        onKilled={onChanged}
      />
      <ReasonConfirmModal
        opened={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        title="Confirm Toggle"
        message={
          <Text>
            {toggleTarget?.enabled ? 'Disable' : 'Enable'} policy <Text span fw={500}>{toggleTarget?.policyType}</Text>?
          </Text>
        }
        confirmLabel={toggleTarget?.enabled ? 'Disable' : 'Enable'}
        confirmColor={toggleTarget?.enabled ? 'red' : 'green'}
        onConfirm={confirmToggleEnabled}
      />
      <RiskPolicyHistoryModal policy={historyTarget} onClose={() => setHistoryTarget(null)} />
      <EditRiskPolicyModal
        policy={editPolicyTarget}
        targetDescription={strategyName}
        onClose={() => setEditPolicyTarget(null)}
        onSaved={onChanged}
      />
      <AddRiskPolicyModal
        opened={createPolicyOpen}
        onClose={() => setCreatePolicyOpen(false)}
        target={{ strategyId }}
        targetLabel="this strategy"
        onCreated={onChanged}
      />
      <ReasonConfirmModal
        opened={!!deletePolicyTarget}
        onClose={() => setDeletePolicyTarget(null)}
        title="Confirm Delete"
        message={<Text>Delete policy <Text span fw={500}>{deletePolicyTarget?.policyType}</Text>?</Text>}
        confirmLabel="Delete"
        onConfirm={confirmDeletePolicy}
      />
    </>
  );
}
