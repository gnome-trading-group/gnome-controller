import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Title,
  Group,
  Stack,
  Notification,
  Center,
  Loader,
  ActionIcon,
  Tooltip,
  Badge,
  Select,
  Text,
  Button,
  Tabs,
  Paper,
  Modal,
  Textarea,
  Switch,
} from '@mantine/core';
import { IconRefresh, IconEye, IconEyeOff, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_RowSelectionState } from 'mantine-react-table';
import { marketDataApi, registryApi } from '../../../utils/api';
import { useListingSearch, useListingLabels } from '../../../hooks/useAsyncSearch';
import { Gap, GapStatus, GapReason } from '../../../types/gaps';

const STATUS_CONFIG: Record<GapStatus, { color: string; icon: React.ReactNode; label: string }> = {
  UNREVIEWED: { color: 'yellow', icon: <IconEyeOff size={14} />, label: 'Unreviewed' },
  REVIEWED: { color: 'gray', icon: <IconEye size={14} />, label: 'Reviewed' },
};

const REASON_OPTIONS: { value: GapReason; label: string }[] = [
  { value: 'EXCHANGE_CLOSED', label: 'Exchange Closed' },
  { value: 'INTERNAL_ERROR', label: 'Internal Error' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const ALL_STATUSES: GapStatus[] = ['UNREVIEWED', 'REVIEWED'];

interface TableRow extends Gap {
  listingLabel: string;
  id: string;
}

function formatTimestamp(ts: number): string {
  if (!ts) return '-';
  const date = new Date(ts * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}Z`;
}

function Gaps() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const initialListingId = searchParams.get('listingId');
  const [selectedStatus, setSelectedStatus] = useState<GapStatus>('UNREVIEWED');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(initialListingId);
  const [listingSearchValue, setListingSearchValue] = useState('');
  const { options: listingSearchOptions, isLoading: listingSearchLoading } = useListingSearch(listingSearchValue);
  const [selectedListingOption, setSelectedListingOption] = useState<{ value: string; label: string } | null>(null);

  const [lastEvaluatedKey, setLastEvaluatedKey] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewReason, setReviewReason] = useState<GapReason>('UNKNOWN');
  const [reviewExpected, setReviewExpected] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleListingChange = useCallback((listingId: string | null) => {
    setSelectedListingId(listingId);
    if (!listingId) setSelectedListingOption(null);
    if (listingId) {
      setSearchParams({ listingId });
    } else {
      setSearchParams({});
    }
  }, [setSearchParams]);

  useEffect(() => {
    if (!initialListingId) return;
    registryApi.listListingsPaginated({ listingId: parseInt(initialListingId), limit: 1 })
      .then(rows => {
        const l = rows[0];
        if (l) setSelectedListingOption({ value: String(l.listingId), label: `${l.listingId} - ${l.exchangeName} - ${l.securitySymbol}` });
      })
      .catch(() => {});
  }, [initialListingId]);

  const listingOptions = useMemo(() => {
    if (selectedListingOption && !listingSearchOptions.some(o => o.value === selectedListingOption.value)) {
      return [selectedListingOption, ...listingSearchOptions];
    }
    return listingSearchOptions;
  }, [listingSearchOptions, selectedListingOption]);

  const fetchGaps = useCallback(async (append = false) => {
    setLoading(true);
    setError(null);
    setApiError(null);

    try {
      let response;
      if (selectedListingId) {
        response = await marketDataApi.getGapsByListing({
          listingId: parseInt(selectedListingId),
          lastEvaluatedKey: append ? lastEvaluatedKey || undefined : undefined,
        });
      } else {
        response = await marketDataApi.listGaps({
          status: selectedStatus,
          lastEvaluatedKey: append ? lastEvaluatedKey || undefined : undefined,
        });
      }

      if (response.error) {
        setApiError(response.error);
      }

      if (append) {
        setGaps((prev) => [...prev, ...response.gaps]);
      } else {
        setGaps(response.gaps);
      }
      setLastEvaluatedKey(response.lastEvaluatedKey || null);
      setHasMore(!!response.lastEvaluatedKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch gaps');
    } finally {
      setLoading(false);
    }
  }, [selectedListingId, selectedStatus, lastEvaluatedKey]);

  useEffect(() => {
    setRowSelection({});
    setLastEvaluatedKey(null);
    fetchGaps(false);
  }, [selectedStatus, selectedListingId]);

  const handleRefresh = () => {
    setRowSelection({});
    setLastEvaluatedKey(null);
    fetchGaps(false);
  };

  const handleLoadMore = () => {
    fetchGaps(true);
  };

  const gapListingIds = useMemo(() => gaps.map(g => g.listingId), [gaps]);
  const listingLabelMap = useListingLabels(gapListingIds);

  const tableData = useMemo<TableRow[]>(() => {
    return gaps.map((gap) => ({
      ...gap,
      listingLabel: listingLabelMap[gap.listingId] || `Listing ${gap.listingId}`,
      id: `${gap.listingId}-${gap.timestamp}`,
    }));
  }, [gaps, listingLabelMap]);

  const selectedGaps = useMemo(() => {
    return tableData.filter((row) => rowSelection[row.id]);
  }, [tableData, rowSelection]);

  const openReviewModal = () => {
    setReviewReason('UNKNOWN');
    setReviewExpected(false);
    setReviewNote('');
    setUpdateError(null);
    setReviewModalOpen(true);
  };

  const handleUpdateGaps = async () => {
    if (selectedGaps.length === 0) return;

    setUpdating(true);
    setUpdateError(null);

    try {
      const response = await marketDataApi.updateGaps({
        gaps: selectedGaps.map((gap) => ({
          listingId: gap.listingId,
          timestamp: gap.timestamp,
          reason: reviewReason,
          expected: reviewExpected,
          note: reviewNote || undefined,
        })),
      });

      if (response.errors && response.errors.length > 0) {
        setUpdateError(`Updated ${response.updated} gaps, but ${response.errors.length} failed: ${response.errors[0].error}`);
      } else {
        setReviewModalOpen(false);
        setRowSelection({});
        fetchGaps(false);
      }
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update gaps');
    } finally {
      setUpdating(false);
    }
  };

  const columns = useMemo<MRT_ColumnDef<TableRow>[]>(() => [
    {
      accessorKey: 'listingId',
      header: 'Listing ID',
      size: 100,
    },
    {
      accessorKey: 'listingLabel',
      header: 'Listing',
      size: 200,
    },
    {
      accessorKey: 'timestamp',
      header: 'Timestamp',
      size: 150,
      Cell: ({ cell }) => formatTimestamp(cell.getValue<number>()),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 130,
      Cell: ({ cell }) => {
        const status = cell.getValue<GapStatus>();
        const config = STATUS_CONFIG[status];
        return (
          <Badge color={config.color} size="sm" leftSection={config.icon}>
            {config.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      size: 140,
      Cell: ({ cell }) => {
        const reason = cell.getValue<GapReason>();
        const option = REASON_OPTIONS.find((o) => o.value === reason);
        return option?.label || reason;
      },
    },
    {
      accessorKey: 'expected',
      header: 'Expected',
      size: 100,
      Cell: ({ cell }) => {
        const expected = cell.getValue<boolean>();
        return expected ? (
          <Badge color="green" size="sm" leftSection={<IconCheck size={14} />}>Yes</Badge>
        ) : (
          <Badge color="red" size="sm" leftSection={<IconAlertTriangle size={14} />}>No</Badge>
        );
      },
    },
    {
      accessorKey: 'note',
      header: 'Note',
      size: 200,
      Cell: ({ cell }) => {
        const note = cell.getValue<string | null>();
        return note ? (
          <Text size="sm" lineClamp={2}>{note}</Text>
        ) : (
          <Text size="sm" c="dimmed">-</Text>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: 150,
      Cell: ({ cell }) => formatTimestamp(cell.getValue<number>()),
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: tableData,
    enableRowSelection: true,
    enableSelectAll: true,
    getRowId: (row) => row.id,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    mantineTableContainerProps: { style: { maxHeight: '600px' } },
    enablePagination: false,
    enableBottomToolbar: false,
    enableColumnResizing: true,
    enableStickyHeader: true,
    initialState: {
      density: 'xs',
      columnVisibility: {
        listingId: false,
      },
    },
  });

  const statusCounts = useMemo(() => {
    if (!selectedListingId) return null;
    const counts: Record<GapStatus, number> = { UNREVIEWED: 0, REVIEWED: 0 };
    gaps.forEach((gap) => {
      counts[gap.status]++;
    });
    return counts;
  }, [gaps, selectedListingId]);

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Gaps</Title>
          <Group>
            {selectedGaps.length > 0 && (
              <Button onClick={openReviewModal} leftSection={<IconCheck size={16} />}>
                Review {selectedGaps.length} Gap{selectedGaps.length !== 1 ? 's' : ''}
              </Button>
            )}
            <Tooltip label="Refresh">
              <ActionIcon variant="light" onClick={handleRefresh} loading={loading}>
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {error && (
          <Notification color="red" onClose={() => setError(null)}>
            {error}
          </Notification>
        )}
        {apiError && (
          <Notification color="yellow" onClose={() => setApiError(null)}>
            API Warning: {apiError}
          </Notification>
        )}

        <Group align="flex-end">
          <Select
            label="Filter by Listing"
            placeholder="Search listings..."
            searchable
            clearable
            data={listingOptions}
            value={selectedListingId}
            onChange={(v) => { handleListingChange(v); if (v) { const opt = listingOptions.find(o => o.value === v); if (opt) setSelectedListingOption(opt); } }}
            onSearchChange={setListingSearchValue}
            searchValue={listingSearchValue}
            filter={({ options }) => options}
            rightSection={listingSearchLoading ? <Loader size="xs" /> : undefined}
            style={{ minWidth: 300 }}
          />
        </Group>

        {selectedListingId && statusCounts && (
          <Group gap="md">
            {ALL_STATUSES.map((status) => {
              const config = STATUS_CONFIG[status];
              return (
                <Paper key={status} p="sm" withBorder>
                  <Group gap="xs">
                    <Badge color={config.color} size="lg" leftSection={config.icon}>
                      {config.label}
                    </Badge>
                    <Text fw={600}>{statusCounts[status]}</Text>
                  </Group>
                </Paper>
              );
            })}
          </Group>
        )}

        {!selectedListingId && (
          <Tabs value={selectedStatus} onChange={(v) => setSelectedStatus(v as GapStatus)}>
            <Tabs.List>
              {ALL_STATUSES.map((status) => {
                const config = STATUS_CONFIG[status];
                return (
                  <Tabs.Tab key={status} value={status} leftSection={config.icon}>
                    {config.label}
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>
          </Tabs>
        )}

        {loading && gaps.length === 0 ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : (
          <>
            <MantineReactTable table={table} />
            {hasMore && (
              <Center>
                <Button variant="light" onClick={handleLoadMore} loading={loading}>
                  Load More
                </Button>
              </Center>
            )}
          </>
        )}
      </Stack>

      <Modal
        opened={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title={`Review ${selectedGaps.length} Gap${selectedGaps.length !== 1 ? 's' : ''}`}
        size="md"
      >
        <Stack gap="md">
          {updateError && (
            <Notification color="red" onClose={() => setUpdateError(null)}>
              {updateError}
            </Notification>
          )}
          <Select
            label="Reason"
            data={REASON_OPTIONS}
            value={reviewReason}
            onChange={(v) => setReviewReason(v as GapReason)}
          />
          <Switch
            label="Expected gap"
            description="Was this gap expected (e.g., exchange closed, maintenance)?"
            checked={reviewExpected}
            onChange={(e) => setReviewExpected(e.currentTarget.checked)}
          />
          <Textarea
            label="Note"
            placeholder="Add a note for context..."
            value={reviewNote}
            onChange={(e) => setReviewNote(e.currentTarget.value)}
            rows={3}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateGaps} loading={updating}>
              Mark as Reviewed
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default Gaps;