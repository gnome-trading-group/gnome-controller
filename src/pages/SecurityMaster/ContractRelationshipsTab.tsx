import React, { useState, useEffect, useMemo } from 'react';
import { ActionIcon, Badge, Group, Tooltip } from '@mantine/core';
import { IconCheck, IconTrash } from '@tabler/icons-react';
import ReactTimeAgo from 'react-time-ago';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_Row } from 'mantine-react-table';
import { ContractRelationship, ContractRelationshipType } from '../../types';
import { registryApi } from '../../utils/api';

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  COMPLEMENT: 'teal',
  IMPLIES: 'blue',
  MUTUALLY_EXCLUSIVE: 'orange',
  CORRELATED: 'gray',
  HEDGEABLE_WITH: 'violet',
};

function ContractRelationshipsTab() {
  const [relationships, setRelationships] = useState<ContractRelationship[]>([]);
  const [loading, setLoading] = useState(false);
  const [symbolById, setSymbolById] = useState<Record<number, string>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await registryApi.listContractRelationships();
      setRelationships(result as ContractRelationship[]);

      const uniqueIds = [...new Set(result.flatMap((r: ContractRelationship) => [r.securityIdA, r.securityIdB]))];
      const securities = await Promise.all(
        uniqueIds.map(id => registryApi.listSecuritiesPaginated({ securityId: id, limit: 1 }).then(rows => rows[0]))
      );
      const map: Record<number, string> = {};
      securities.forEach(s => { if (s) map[s.securityId] = s.symbol; });
      setSymbolById(map);
    } catch (err) {
      console.error('Failed to fetch contract relationships:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleApprove = async (relationshipId: number) => {
    try {
      await registryApi.reviewContractRelationship(relationshipId, true);
      setRelationships(prev =>
        prev.map(r =>
          r.relationshipId === relationshipId
            ? { ...r, reviewed: true, reviewedAt: new Date().toISOString() }
            : r
        )
      );
    } catch (err) {
      console.error('Failed to approve relationship:', err);
    }
  };

  const handleDelete = async (relationshipId: number) => {
    try {
      await registryApi.deleteContractRelationship(relationshipId);
      setRelationships(prev => prev.filter(r => r.relationshipId !== relationshipId));
    } catch (err) {
      console.error('Failed to delete relationship:', err);
    }
  };

  const columns = useMemo<MRT_ColumnDef<ContractRelationship>[]>(() => [
    {
      accessorKey: 'securityIdA',
      header: 'Contract A',
      enableSorting: true,
      Cell: ({ row }) => symbolById[row.original.securityIdA] ?? `#${row.original.securityIdA}`,
    },
    {
      accessorKey: 'securityIdB',
      header: 'Contract B',
      enableSorting: true,
      Cell: ({ row }) => symbolById[row.original.securityIdB] ?? `#${row.original.securityIdB}`,
    },
    {
      accessorKey: 'relationshipType',
      header: 'Type',
      enableSorting: true,
      enableGrouping: true,
      Cell: ({ row }) => (
        <Badge
          color={RELATIONSHIP_COLORS[row.original.relationshipType] ?? 'gray'}
          variant="light"
          size="sm"
        >
          {row.original.relationshipType.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      accessorKey: 'confidence',
      header: 'Confidence',
      enableSorting: true,
      size: 100,
      Cell: ({ row }) => `${(row.original.confidence * 100).toFixed(0)}%`,
    },
    {
      accessorKey: 'method',
      header: 'Method',
      enableSorting: true,
      enableGrouping: true,
      size: 100,
    },
    {
      accessorKey: 'reviewed',
      header: 'Reviewed',
      enableSorting: true,
      enableGrouping: true,
      size: 100,
      Cell: ({ row }) => (
        <Badge color={row.original.reviewed ? 'green' : 'yellow'} variant="light" size="sm">
          {row.original.reviewed ? 'Reviewed' : 'Pending'}
        </Badge>
      ),
    },
    {
      accessorKey: 'dateCreated',
      header: 'Created',
      enableSorting: true,
      Cell: ({ row }) =>
        row.original.dateCreated ? (
          <ReactTimeAgo date={new Date(row.original.dateCreated)} timeStyle="round" />
        ) : '-',
    },
  ], [symbolById]);

  const table = useMantineReactTable({
    columns,
    data: relationships,
    state: { isLoading: loading },
    enableColumnFilters: true,
    enableSorting: true,
    enablePagination: true,
    enableBottomToolbar: true,
    enableTopToolbar: true,
    enableGrouping: true,
    enableRowActions: true,
    positionActionsColumn: 'last',
    mantineTableProps: {
      striped: true,
      highlightOnHover: true,
      withColumnBorders: true,
    },
    initialState: {
      sorting: [{ id: 'dateCreated', desc: true }],
      density: 'xs',
      columnFilters: [{ id: 'reviewed', value: false }],
    },
    renderRowActions: ({ row }: { row: MRT_Row<ContractRelationship> }) => (
      <Group gap="xs" wrap="nowrap">
        {!row.original.reviewed && (
          <Tooltip label="Approve" position="left" withArrow openDelay={500}>
            <ActionIcon
              variant="subtle"
              color="green"
              onClick={(e) => {
                e.stopPropagation();
                handleApprove(row.original.relationshipId);
              }}
            >
              <IconCheck size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label="Delete" position="left" withArrow openDelay={500}>
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row.original.relationshipId);
            }}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    ),
  });

  return <MantineReactTable table={table} />;
}

export default React.memo(ContractRelationshipsTab);
