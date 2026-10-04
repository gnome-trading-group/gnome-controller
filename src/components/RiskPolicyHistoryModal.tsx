import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Modal } from '@mantine/core';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { RiskPolicy, RiskPolicyHistory } from '../types';
import { registryApi } from '../utils/api';
import { describeHistoryAction, errorMessage, formatActor } from '../utils/kill-switch';
import { formatRiskParameters } from '../utils/risk-parameters';

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'blue',
  UPDATE: 'yellow',
  DELETE: 'gray',
};

interface RiskPolicyHistoryModalProps {
  policy: RiskPolicy | null;
  onClose: () => void;
}

export function RiskPolicyHistoryModal({ policy, onClose }: RiskPolicyHistoryModalProps) {
  const [rows, setRows] = useState<RiskPolicyHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const policyId = policy?.policyId;

  useEffect(() => {
    if (policyId === undefined) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows([]);
    registryApi.listRiskPolicyHistory(policyId)
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((e) => { if (!cancelled) setError(errorMessage(e, 'Failed to load history')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [policyId]);

  const columns = useMemo<MRT_ColumnDef<RiskPolicyHistory>[]>(() => [
    {
      accessorKey: 'changedAt',
      header: 'When',
      size: 120,
      Cell: ({ row }: { row: MRT_Row<RiskPolicyHistory> }) => (
        <span title={new Date(row.original.changedAt).toLocaleString()}>
          <ReactTimeAgo date={new Date(row.original.changedAt)} timeStyle="round" />
        </span>
      ),
    },
    {
      id: 'change',
      header: 'Change',
      size: 150,
      Cell: ({ row }: { row: MRT_Row<RiskPolicyHistory> }) => (
        <Badge color={ACTION_COLORS[row.original.action] ?? 'gray'} variant="light" size="sm">
          {describeHistoryAction(row.original)}
        </Badge>
      ),
    },
    {
      accessorKey: 'actor',
      header: 'Actor',
      size: 140,
      Cell: ({ row }: { row: MRT_Row<RiskPolicyHistory> }) => formatActor(row.original.actor),
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      Cell: ({ row }: { row: MRT_Row<RiskPolicyHistory> }) => row.original.reason || '—',
    },
    {
      id: 'parameters',
      header: 'Limits',
      Cell: ({ row }: { row: MRT_Row<RiskPolicyHistory> }) =>
        row.original.newParameters ? formatRiskParameters(row.original.newParameters) : '—',
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: rows,
    state: { isLoading: loading },
    enableEditing: false,
    enableColumnFilters: false,
    enableSorting: false,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: false,
    initialState: { density: 'xs', pagination: { pageIndex: 0, pageSize: 15 } },
    mantineTableProps: { striped: true, highlightOnHover: true, withColumnBorders: true },
  });

  return (
    <Modal
      opened={!!policy}
      onClose={onClose}
      title={policy ? `History — ${policy.policyType} (policy ${policy.policyId})` : 'History'}
      size="xl"
    >
      {error && <Alert color="red" title="Error" mb="sm">{error}</Alert>}
      <MantineReactTable table={table} />
    </Modal>
  );
}
