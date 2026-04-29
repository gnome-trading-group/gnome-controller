import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Modal,
  Textarea,
  Switch,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconRefresh, IconCheck, IconEye, IconEyeOff, IconPlayerPlay } from '@tabler/icons-react';
import { MantineReactTable, useMantineReactTable, type MRT_ColumnDef, type MRT_RowSelectionState } from 'mantine-react-table';
import { marketDataApi } from '../../../utils/api';
import { useGlobalState } from '../../../context/GlobalStateContext';
import { QualityIssue, QualityIssueStatus, QualityBackfillMode, formatRuleType, getRuleTypeColor } from '../../../types/quality-issues';
import { formatSecurityType } from '../../../utils/security-master';

const STATUS_CONFIG: Record<QualityIssueStatus, { color: string; icon: React.ReactNode; label: string }> = {
  UNREVIEWED: { color: 'yellow', icon: <IconEyeOff size={14} />, label: 'Unreviewed' },
  REVIEWED: { color: 'gray', icon: <IconEye size={14} />, label: 'Reviewed' },
};

const ALL_STATUSES: QualityIssueStatus[] = ['UNREVIEWED', 'REVIEWED'];

interface TableRow extends QualityIssue {
  listingLabel: string;
  rowId: string;
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

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function QualityIssues() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { listings, exchanges, securities } = useGlobalState();

  const initialListingId = searchParams.get('listingId');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(initialListingId);
  const [selectedRuleType, setSelectedRuleType] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<QualityIssueStatus>('UNREVIEWED');

  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastEvaluatedKey, setLastEvaluatedKey] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [backfillModalOpen, setBackfillModalOpen] = useState(false);
  const [backfillExchangeId, setBackfillExchangeId] = useState<string | null>(null);
  const [backfillSecurityId, setBackfillSecurityId] = useState<string | null>(null);
  const [backfillStartDate, setBackfillStartDate] = useState<Date | null>(null);
  const [backfillEndDate, setBackfillEndDate] = useState<Date | null>(null);
  const [backfillMode, setBackfillMode] = useState<QualityBackfillMode>('all');
  const [backfillResetStatistics, setBackfillResetStatistics] = useState(false);
  const [backfillSubmitting, setBackfillSubmitting] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillSuccess, setBackfillSuccess] = useState<string | null>(null);

  const handleListingChange = useCallback((listingId: string | null) => {
    setSelectedListingId(listingId);
    if (listingId) {
      setSearchParams({ listingId });
    } else {
      setSearchParams({});
    }
  }, [setSearchParams]);

  const listingOptions = useMemo(() => {
    return listings.map((listing) => {
      const exchange = exchanges.find((e) => e.exchangeId === listing.exchangeId);
      const security = securities.find((s) => s.securityId === listing.securityId);
      return {
        value: String(listing.listingId),
        label: `${listing.listingId} - ${exchange?.exchangeName || 'Unknown'} - ${security?.symbol || 'Unknown'} (${formatSecurityType(security?.type || 0)})`,
      };
    });
  }, [listings, securities, exchanges]);

  const exchangeOptions = useMemo(() =>
    exchanges.map((e) => ({ value: String(e.exchangeId), label: e.exchangeName })),
    [exchanges],
  );

  const securityOptions = useMemo(() =>
    securities.map((s) => ({ value: String(s.securityId), label: `${s.symbol} (${formatSecurityType(s.type)})` })),
    [securities],
  );

  const listingLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    listings.forEach((listing) => {
      const exchange = exchanges.find((e) => e.exchangeId === listing.exchangeId);
      const security = securities.find((s) => s.securityId === listing.securityId);
      map.set(listing.listingId, `${security?.symbol || 'Unknown'} @ ${exchange?.exchangeName || 'Unknown'}`);
    });
    return map;
  }, [listings, securities, exchanges]);

  const fetchIssues = useCallback(async (append = false) => {
    setLoading(true);
    setError(null);

    try {
      let response;
      if (selectedListingId) {
        response = await marketDataApi.getQualityIssuesByListing({
          listingId: parseInt(selectedListingId),
          lastEvaluatedKey: append ? lastEvaluatedKey || undefined : undefined,
        });
      } else {
        response = await marketDataApi.listQualityIssues({
          status: selectedStatus,
          ruleType: selectedRuleType || undefined,
          lastEvaluatedKey: append ? lastEvaluatedKey || undefined : undefined,
        });
      }

      if (append) {
        setIssues((prev) => [...prev, ...response.issues]);
      } else {
        setIssues(response.issues);
      }
      setLastEvaluatedKey(response.lastEvaluatedKey || null);
      setHasMore(!!response.lastEvaluatedKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch quality issues');
    } finally {
      setLoading(false);
    }
  }, [selectedListingId, selectedStatus, selectedRuleType, lastEvaluatedKey]);

  useEffect(() => {
    setRowSelection({});
    setLastEvaluatedKey(null);
    fetchIssues(false);
  }, [selectedStatus, selectedListingId, selectedRuleType]);

  const handleRefresh = () => {
    setRowSelection({});
    setLastEvaluatedKey(null);
    fetchIssues(false);
  };

  const tableData = useMemo<TableRow[]>(() => {
    return issues.map((issue) => ({
      ...issue,
      listingLabel: listingLabelMap.get(issue.listingId) || `Listing ${issue.listingId}`,
      rowId: `${issue.listingId}-${issue.issueId}`,
    }));
  }, [issues, listingLabelMap]);

  const ruleTypeOptions = useMemo(() => {
    const seen = new Set(issues.map((i) => i.ruleType));
    return [...seen].sort().map((rt) => ({ value: rt, label: formatRuleType(rt) }));
  }, [issues]);

  const selectedIssues = useMemo(
    () => tableData.filter((row) => rowSelection[row.rowId]),
    [tableData, rowSelection],
  );

  const handleUpdateIssues = async () => {
    if (selectedIssues.length === 0) return;
    setUpdating(true);
    setUpdateError(null);

    try {
      const response = await marketDataApi.updateQualityIssues({
        issues: selectedIssues.map((issue) => ({
          listingId: issue.listingId,
          issueId: issue.issueId,
          note: reviewNote || undefined,
        })),
      });

      if (response.errors && response.errors.length > 0) {
        setUpdateError(`Updated ${response.updated}, but ${response.errors.length} failed: ${response.errors[0].error}`);
      } else {
        setReviewModalOpen(false);
        setRowSelection({});
        fetchIssues(false);
      }
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update issues');
    } finally {
      setUpdating(false);
    }
  };

  const handleBackfillSubmit = async () => {
    if (!backfillExchangeId || !backfillSecurityId || !backfillStartDate || !backfillEndDate) return;
    setBackfillSubmitting(true);
    setBackfillError(null);
    setBackfillSuccess(null);

    try {
      const response = await marketDataApi.triggerQualityBackfill({
        exchangeId: parseInt(backfillExchangeId),
        securityId: parseInt(backfillSecurityId),
        startDate: formatDate(backfillStartDate),
        endDate: formatDate(backfillEndDate),
        mode: backfillMode,
        resetStatistics: backfillResetStatistics,
      });
      setBackfillSuccess(response.message);
      setBackfillModalOpen(false);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : 'Failed to trigger backfill');
    } finally {
      setBackfillSubmitting(false);
    }
  };

  const backfillListing = useMemo(() => {
    if (!backfillExchangeId || !backfillSecurityId) return null;
    return listings.find(
      (l) => l.exchangeId === parseInt(backfillExchangeId) && l.securityId === parseInt(backfillSecurityId),
    ) || null;
  }, [backfillExchangeId, backfillSecurityId, listings]);


  const columns = useMemo<MRT_ColumnDef<TableRow>[]>(() => [
    { accessorKey: 'listingId', header: 'Listing ID', size: 100 },
    { accessorKey: 'listingLabel', header: 'Listing', size: 200 },
    {
      accessorKey: 'ruleType',
      header: 'Rule Type',
      size: 190,
      Cell: ({ cell }) => {
        const rt = cell.getValue<string>();
        return <Badge color={getRuleTypeColor(rt)} size="sm">{formatRuleType(rt)}</Badge>;
      },
    },
    {
      accessorKey: 'timestamp',
      header: 'Timestamp',
      size: 160,
      Cell: ({ cell }) => formatTimestamp(cell.getValue<number>()),
    },
    {
      accessorKey: 's3Key',
      header: 'S3 Key',
      size: 220,
      Cell: ({ cell }) => (
        <Text size="xs" truncate="end" style={{ maxWidth: 200 }}>{cell.getValue<string>()}</Text>
      ),
    },
    {
      accessorKey: 'details',
      header: 'Details',
      size: 200,
      Cell: ({ cell }) => {
        const val = cell.getValue<string | null>();
        return val
          ? <Text size="sm" lineClamp={2}>{val}</Text>
          : <Text size="sm" c="dimmed">-</Text>;
      },
    },
    { accessorKey: 'recordCount', header: 'Records', size: 90 },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 130,
      Cell: ({ cell }) => {
        const status = cell.getValue<QualityIssueStatus>();
        const config = STATUS_CONFIG[status];
        return (
          <Badge color={config.color} size="sm" leftSection={config.icon}>
            {config.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'note',
      header: 'Note',
      size: 180,
      Cell: ({ cell }) => {
        const val = cell.getValue<string | null>();
        return val
          ? <Text size="sm" lineClamp={2}>{val}</Text>
          : <Text size="sm" c="dimmed">-</Text>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      size: 160,
      Cell: ({ cell }) => formatTimestamp(cell.getValue<number>()),
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data: tableData,
    enableRowSelection: true,
    enableSelectAll: true,
    getRowId: (row) => row.rowId,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    mantineTableContainerProps: { style: { maxHeight: '600px' } },
    enablePagination: false,
    enableBottomToolbar: false,
    enableColumnResizing: true,
    enableStickyHeader: true,
    initialState: {
      density: 'xs',
      columnVisibility: { listingId: false },
    },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => {
        const { listingId, timestamp } = row.original;
        navigate(`/market-data/quality-issues/investigate/${listingId}/${timestamp}`);
      },
      style: { cursor: 'pointer' },
    }),
  });

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Quality Issues</Title>
          <Group>
            {backfillSuccess && (
              <Notification color="green" onClose={() => setBackfillSuccess(null)} withCloseButton>
                {backfillSuccess}
              </Notification>
            )}
            {selectedIssues.length > 0 && (
              <Button
                leftSection={<IconCheck size={16} />}
                onClick={() => { setReviewNote(''); setUpdateError(null); setReviewModalOpen(true); }}
              >
                Review {selectedIssues.length} Issue{selectedIssues.length !== 1 ? 's' : ''}
              </Button>
            )}
            <Button
              variant="light"
              leftSection={<IconPlayerPlay size={16} />}
              onClick={() => { setBackfillError(null); setBackfillSuccess(null); setBackfillModalOpen(true); }}
            >
              Run Backfill
            </Button>
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

        <Group align="flex-end">
          <Select
            label="Filter by Listing"
            placeholder="All listings"
            searchable
            clearable
            data={listingOptions}
            value={selectedListingId}
            onChange={handleListingChange}
            style={{ minWidth: 300 }}
          />
          {!selectedListingId && (
            <Select
              label="Filter by Rule Type"
              placeholder="All rule types"
              clearable
              data={ruleTypeOptions}
              value={selectedRuleType}
              onChange={setSelectedRuleType}
              style={{ minWidth: 220 }}
            />
          )}
        </Group>

        {!selectedListingId && (
          <Tabs value={selectedStatus} onChange={(v) => setSelectedStatus(v as QualityIssueStatus)}>
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

        {loading && issues.length === 0 ? (
          <Center py="xl"><Loader /></Center>
        ) : (
          <>
            <MantineReactTable table={table} />
            {hasMore && (
              <Center>
                <Button variant="light" onClick={() => fetchIssues(true)} loading={loading}>
                  Load More
                </Button>
              </Center>
            )}
          </>
        )}
      </Stack>

      {/* Review Modal */}
      <Modal
        opened={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title={`Review ${selectedIssues.length} Issue${selectedIssues.length !== 1 ? 's' : ''}`}
        size="md"
      >
        <Stack gap="md">
          {updateError && (
            <Notification color="red" onClose={() => setUpdateError(null)}>{updateError}</Notification>
          )}
          <Textarea
            label="Note"
            placeholder="Add a note for context..."
            value={reviewNote}
            onChange={(e) => setReviewNote(e.currentTarget.value)}
            rows={3}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setReviewModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateIssues} loading={updating}>Mark as Reviewed</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Backfill Modal */}
      <Modal
        opened={backfillModalOpen}
        onClose={() => setBackfillModalOpen(false)}
        title="Trigger Quality Backfill"
        size="md"
      >
        <Stack gap="md">
          {backfillError && (
            <Notification color="red" onClose={() => setBackfillError(null)}>{backfillError}</Notification>
          )}
          <Select
            label="Exchange"
            placeholder="Select exchange"
            data={exchangeOptions}
            value={backfillExchangeId}
            onChange={setBackfillExchangeId}
            searchable
          />
          <Select
            label="Security"
            placeholder="Select security"
            data={securityOptions}
            value={backfillSecurityId}
            onChange={setBackfillSecurityId}
            searchable
          />
          {backfillListing && (
            <Text size="sm" c="dimmed">
              Listing ID: {backfillListing.listingId}
            </Text>
          )}
          <DatePickerInput
            label="Start Date"
            placeholder="YYYY-MM-DD"
            valueFormat="YYYY-MM-DD"
            weekendDays={[]}
            value={backfillStartDate}
            onChange={setBackfillStartDate}
          />
          <DatePickerInput
            label="End Date"
            placeholder="YYYY-MM-DD"
            valueFormat="YYYY-MM-DD"
            weekendDays={[]}
            value={backfillEndDate}
            onChange={setBackfillEndDate}
            minDate={backfillStartDate || undefined}
          />
          <Select
            label="Mode"
            description="statistics: build rolling stats only · issues: detect anomalies only · all: both"
            data={[
              { value: 'statistics', label: 'Statistics — build rolling stats only' },
              { value: 'issues', label: 'Issues — detect anomalies only' },
              { value: 'all', label: 'All — statistics + anomaly detection' },
            ]}
            value={backfillMode}
            onChange={(v) => {
              setBackfillMode((v as QualityBackfillMode) ?? 'all');
              if (v === 'issues') setBackfillResetStatistics(false);
            }}
          />
          {backfillMode !== 'issues' && (
            <Switch
              label="Reset Statistics"
              description="Delete existing rolling stats for each day before writing (use on first full backfill)"
              checked={backfillResetStatistics}
              onChange={(e) => setBackfillResetStatistics(e.currentTarget.checked)}
            />
          )}
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setBackfillModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleBackfillSubmit}
              loading={backfillSubmitting}
              disabled={!backfillExchangeId || !backfillSecurityId || !backfillStartDate || !backfillEndDate}
            >
              Submit Backfill
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

export default QualityIssues;
