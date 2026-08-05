import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { ContractRelationshipType, CreateContractRelationship, EventContract } from '../../types';
import { registryApi } from '../../utils/api';
import { useEventSearch } from '../../hooks/useAsyncSearch';

const RELATIONSHIP_TYPE_OPTIONS: { value: ContractRelationshipType; label: string }[] = [
  { value: 'EQUIVALENT', label: 'Equivalent' },
  { value: 'COMPLEMENT', label: 'Complement' },
  { value: 'IMPLIES', label: 'Implies' },
  { value: 'MUTUALLY_EXCLUSIVE', label: 'Mutually Exclusive' },
  { value: 'HEDGEABLE_WITH', label: 'Hedgeable With' },
];

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
  COMPLEMENT: 'teal',
  IMPLIES: 'blue',
  MUTUALLY_EXCLUSIVE: 'orange',
  HEDGEABLE_WITH: 'violet',
};

interface BulkCreateRelationshipModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
  currentEventId: number;
  currentEventTitle: string;
  currentContracts: EventContract[];
}

function contractLabel(c: EventContract): string {
  const sym = c.securitySymbol ?? `#${c.securityId}`;
  return `${sym} (${c.outcomeLabel})`;
}

function contractSymbol(securityId: number, contracts: EventContract[]): string {
  const c = contracts.find(x => x.securityId === securityId);
  if (!c) return `#${securityId}`;
  return c.securitySymbol ?? `#${securityId}`;
}

function ContractCheckboxList({
  contracts,
  selected,
  onToggle,
  disabledIds,
  loading,
}: {
  contracts: EventContract[];
  selected: number[];
  onToggle: (ids: number[]) => void;
  disabledIds?: number[];
  loading?: boolean;
}) {
  const allSelectable = contracts.filter(c => !disabledIds?.includes(c.securityId));
  const allSelected = allSelectable.length > 0 && allSelectable.every(c => selected.includes(c.securityId));

  const toggleAll = () => {
    if (allSelected) {
      onToggle(selected.filter(id => !allSelectable.some(c => c.securityId === id)));
    } else {
      const toAdd = allSelectable.map(c => c.securityId).filter(id => !selected.includes(id));
      onToggle([...selected, ...toAdd]);
    }
  };

  if (loading) return <Loader size="sm" />;
  if (contracts.length === 0) return <Text size="sm" c="dimmed">No contracts.</Text>;

  return (
    <Stack gap="xs">
      <Button variant="subtle" size="xs" onClick={toggleAll} style={{ alignSelf: 'flex-start' }}>
        {allSelected ? 'Deselect All' : 'Select All'}
      </Button>
      <ScrollArea.Autosize mah={220}>
        <Stack gap={6}>
          {contracts.map(c => (
            <Checkbox
              key={c.securityId}
              value={String(c.securityId)}
              label={contractLabel(c)}
              checked={selected.includes(c.securityId)}
              disabled={disabledIds?.includes(c.securityId)}
              onChange={e => {
                if (e.currentTarget.checked) {
                  onToggle([...selected, c.securityId]);
                } else {
                  onToggle(selected.filter(id => id !== c.securityId));
                }
              }}
            />
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}

function BulkCreateRelationshipModal({
  opened,
  onClose,
  onCreated,
  currentEventId,
  currentEventTitle,
  currentContracts,
}: BulkCreateRelationshipModalProps) {
  const [selectedA, setSelectedA] = useState<number[]>([]);

  const [eventSearch, setEventSearch] = useState('');
  const { options: eventOptions, isLoading: eventsLoading } = useEventSearch(eventSearch);
  const [targetEventId, setTargetEventId] = useState<number | null>(null);
  const [targetContracts, setTargetContracts] = useState<EventContract[]>([]);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [selectedB, setSelectedB] = useState<number[]>([]);

  const [relationshipType, setRelationshipType] = useState<ContractRelationshipType>('EQUIVALENT');
  const [confidence, setConfidence] = useState<number>(0.9);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetEventId) {
      setTargetContracts([]);
      setSelectedB([]);
      return;
    }
    if (targetEventId === currentEventId) {
      setTargetContracts(currentContracts);
      setSelectedB([]);
      return;
    }
    setLoadingTarget(true);
    registryApi.listEventContracts({ eventId: targetEventId })
      .then(cs => setTargetContracts(cs as EventContract[]))
      .catch(() => setTargetContracts([]))
      .finally(() => setLoadingTarget(false));
  }, [targetEventId, currentEventId, currentContracts]);

  const sameEvent = targetEventId === currentEventId;
  const disabledForB = sameEvent ? selectedA : undefined;

  const effectiveTargetContracts = sameEvent ? currentContracts : targetContracts;

  const preview = useMemo(() => {
    if (!relationshipType || selectedA.length === 0 || selectedB.length === 0) return [];
    return selectedA.flatMap(a =>
      selectedB
        .filter(b => b !== a)
        .map(b => ({
          securityIdA: a,
          securityIdB: b,
          symbolA: contractSymbol(a, currentContracts),
          symbolB: contractSymbol(b, effectiveTargetContracts),
          relationshipType,
          confidence,
        }))
    );
  }, [selectedA, selectedB, relationshipType, confidence, currentContracts, effectiveTargetContracts]);

  const handleClose = () => {
    setSelectedA([]);
    setEventSearch('');
    setTargetEventId(null);
    setTargetContracts([]);
    setSelectedB([]);
    setRelationshipType('EQUIVALENT');
    setConfidence(0.9);
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (preview.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const bodies: CreateContractRelationship[] = preview.map(p => ({
        securityIdA: p.securityIdA,
        securityIdB: p.securityIdB,
        relationshipType: p.relationshipType,
        confidence: p.confidence,
        method: 'manual',
      }));
      await registryApi.createContractRelationshipsBulk(bodies);
      onCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create relationships.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Bulk Create Relationships" size="xl">
      <Stack gap="md">
        <Group align="flex-start" grow>
          <Paper withBorder p="sm">
            <Title order={6} mb="xs">Side A — {currentEventTitle}</Title>
            <ContractCheckboxList
              contracts={currentContracts}
              selected={selectedA}
              onToggle={setSelectedA}
            />
          </Paper>

          <Paper withBorder p="sm">
            <Title order={6} mb="xs">Side B — Target Event</Title>
            <Stack gap="xs">
              <Select
                placeholder="Search for an event..."
                data={eventOptions}
                searchable
                searchValue={eventSearch}
                onSearchChange={setEventSearch}
                value={targetEventId ? String(targetEventId) : null}
                onChange={v => { setTargetEventId(v ? Number(v) : null); setSelectedB([]); }}
                nothingFoundMessage="No events found"
                rightSection={eventsLoading ? <Loader size="xs" /> : undefined}
                filter={({ options }) => options}
              />
              {targetEventId && (
                <ContractCheckboxList
                  contracts={effectiveTargetContracts}
                  selected={selectedB}
                  onToggle={setSelectedB}
                  disabledIds={disabledForB}
                  loading={loadingTarget}
                />
              )}
            </Stack>
          </Paper>
        </Group>

        <Group grow>
          <Select
            label="Relationship Type"
            data={RELATIONSHIP_TYPE_OPTIONS}
            value={relationshipType}
            onChange={v => setRelationshipType((v ?? 'EQUIVALENT') as ContractRelationshipType)}
          />
          <NumberInput
            label="Confidence"
            min={0}
            max={1}
            step={0.01}
            decimalScale={2}
            value={confidence}
            onChange={v => setConfidence(typeof v === 'number' ? v : 0.9)}
          />
        </Group>

        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {selectedA.length} × {selectedB.length} = <strong>{preview.length}</strong> relationships to create
          </Text>
          {preview.length > 0 && (
            <ScrollArea.Autosize mah={200}>
              <Table fz="xs" striped withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Security A</Table.Th>
                    <Table.Th>Security B</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Confidence</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.map((p, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{p.symbolA}</Table.Td>
                      <Table.Td>{p.symbolB}</Table.Td>
                      <Table.Td>
                        <Badge color={RELATIONSHIP_COLORS[p.relationshipType] ?? 'gray'} variant="light" size="xs">
                          {p.relationshipType.replace(/_/g, ' ')}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{(p.confidence * 100).toFixed(0)}%</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          )}
        </Stack>

        {error && <Text c="red" size="sm">{error}</Text>}

        <Group justify="flex-end">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button color="green" onClick={handleSubmit} loading={submitting} disabled={preview.length === 0}>
            Create {preview.length > 0 ? preview.length : ''} Relationships
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default BulkCreateRelationshipModal;
