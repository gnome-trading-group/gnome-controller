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
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { ContractRelationshipType, CreateContractRelationship, EventContract } from '../../types';
import { registryApi } from '../../utils/api';
import { useEventSearch } from '../../hooks/useAsyncSearch';

const RELATIONSHIP_TYPE_OPTIONS: { value: ContractRelationshipType; label: string }[] = [
  { value: 'EQUIVALENT', label: 'Equivalent' },
  { value: 'IMPLIES', label: 'Implies' },
  { value: 'MUTUALLY_EXCLUSIVE', label: 'Mutually Exclusive' },
  { value: 'HEDGEABLE_WITH', label: 'Hedgeable With' },
];

const RELATIONSHIP_COLORS: Record<ContractRelationshipType, string> = {
  EQUIVALENT: 'green',
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
  const [mode, setMode] = useState<'matching' | 'cartesian'>('matching');

  // Cartesian mode state
  const [selectedA, setSelectedA] = useState<number[]>([]);

  // Matching mode state: maps Side A securityId → Side B securityId (null = unset)
  const [pairings, setPairings] = useState<Record<number, number | null>>({});

  const [eventSearch, setEventSearch] = useState('');
  const { options: eventOptions, isLoading: eventsLoading } = useEventSearch(eventSearch);
  const [targetEventId, setTargetEventId] = useState<number | null>(null);
  const [targetContracts, setTargetContracts] = useState<EventContract[]>([]);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [selectedB, setSelectedB] = useState<number[]>([]);

  const [relationshipType, setRelationshipType] = useState<ContractRelationshipType>('EQUIVALENT');
  const [confidence, setConfidence] = useState<number>(0.9);
  const [bidirectional, setBidirectional] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetEventId) {
      setTargetContracts([]);
      setSelectedB([]);
      setPairings({});
      return;
    }
    if (targetEventId === currentEventId) {
      setTargetContracts(currentContracts);
      setSelectedB([]);
      setPairings({});
      return;
    }
    setLoadingTarget(true);
    registryApi.listEventContracts({ eventId: targetEventId })
      .then(cs => setTargetContracts(cs as EventContract[]))
      .catch(() => setTargetContracts([]))
      .finally(() => setLoadingTarget(false));
    setPairings({});
  }, [targetEventId, currentEventId, currentContracts]);

  const sameEvent = targetEventId === currentEventId;
  const disabledForB = sameEvent ? selectedA : undefined;

  const effectiveTargetContracts = sameEvent ? currentContracts : targetContracts;

  // Cartesian mode preview
  const cartesianPreview = useMemo(() => {
    if (mode !== 'cartesian' || !relationshipType || selectedA.length === 0 || selectedB.length === 0) return [];
    const seen = new Set<string>();
    const results: { securityIdA: number; securityIdB: number; symbolA: string; symbolB: string; relationshipType: ContractRelationshipType; confidence: number }[] = [];
    for (const a of selectedA) {
      for (const b of selectedB) {
        if (a === b) continue;
        if (!seen.has(`${a}-${b}`)) {
          seen.add(`${a}-${b}`);
          results.push({ securityIdA: a, securityIdB: b, symbolA: contractSymbol(a, currentContracts), symbolB: contractSymbol(b, effectiveTargetContracts), relationshipType, confidence });
        }
        if (bidirectional && !seen.has(`${b}-${a}`)) {
          seen.add(`${b}-${a}`);
          results.push({ securityIdA: b, securityIdB: a, symbolA: contractSymbol(b, effectiveTargetContracts), symbolB: contractSymbol(a, currentContracts), relationshipType, confidence });
        }
      }
    }
    return results;
  }, [mode, selectedA, selectedB, relationshipType, confidence, bidirectional, currentContracts, effectiveTargetContracts]);

  // 1:1 matching mode preview
  const matchingPreview = useMemo(() => {
    if (mode !== 'matching') return [];
    const results: { securityIdA: number; securityIdB: number; symbolA: string; symbolB: string; relationshipType: ContractRelationshipType; confidence: number }[] = [];
    for (const contract of currentContracts) {
      const bId = pairings[contract.securityId];
      if (bId == null) continue;
      const symbolA = contractSymbol(contract.securityId, currentContracts);
      const symbolB = contractSymbol(bId, effectiveTargetContracts);
      results.push({ securityIdA: contract.securityId, securityIdB: bId, symbolA, symbolB, relationshipType, confidence });
      if (bidirectional) {
        results.push({ securityIdA: bId, securityIdB: contract.securityId, symbolA: symbolB, symbolB: symbolA, relationshipType, confidence });
      }
    }
    return results;
  }, [mode, currentContracts, pairings, effectiveTargetContracts, relationshipType, confidence, bidirectional]);

  const activePreview = mode === 'cartesian' ? cartesianPreview : matchingPreview;

  // B IDs already used in pairings (for disabling in other dropdowns)
  const usedBIds = useMemo(() => new Set(Object.values(pairings).filter((v): v is number => v != null)), [pairings]);

  const handleClose = () => {
    setMode('matching');
    setSelectedA([]);
    setPairings({});
    setEventSearch('');
    setTargetEventId(null);
    setTargetContracts([]);
    setSelectedB([]);
    setRelationshipType('EQUIVALENT');
    setConfidence(0.9);
    setBidirectional(false);
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (activePreview.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const bodies: CreateContractRelationship[] = activePreview.map(p => ({
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

  const targetContractOptions = effectiveTargetContracts.map(c => ({
    value: String(c.securityId),
    label: contractLabel(c),
    disabled: usedBIds.has(c.securityId),
  }));

  return (
    <Modal opened={opened} onClose={handleClose} title="Bulk Create Relationships" size="xl">
      <Stack gap="md">
        <SegmentedControl
          value={mode}
          onChange={v => setMode(v as typeof mode)}
          data={[
            { value: 'matching', label: '1:1 Matching' },
            { value: 'cartesian', label: 'Cartesian Product' },
          ]}
        />

        {mode === 'cartesian' ? (
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
        ) : (
          <Stack gap="xs">
            <Select
              label="Target Event"
              placeholder="Search for an event..."
              data={eventOptions}
              searchable
              searchValue={eventSearch}
              onSearchChange={setEventSearch}
              value={targetEventId ? String(targetEventId) : null}
              onChange={v => { setTargetEventId(v ? Number(v) : null); }}
              nothingFoundMessage="No events found"
              rightSection={eventsLoading ? <Loader size="xs" /> : undefined}
              filter={({ options }) => options}
            />
            {targetEventId && (
              loadingTarget ? <Loader size="sm" /> : (
                <Table fz="sm" withColumnBorders withRowBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{currentEventTitle}</Table.Th>
                      <Table.Th>Paired with</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {currentContracts.map(c => {
                      const currentPairing = pairings[c.securityId] ?? null;
                      const filteredOptions = targetContractOptions.map(opt => ({
                        ...opt,
                        disabled: opt.disabled && Number(opt.value) !== currentPairing,
                      }));
                      return (
                        <Table.Tr key={c.securityId}>
                          <Table.Td>{contractLabel(c)}</Table.Td>
                          <Table.Td>
                            <Select
                              size="xs"
                              placeholder="— unpaired —"
                              data={filteredOptions}
                              value={currentPairing != null ? String(currentPairing) : null}
                              onChange={v => setPairings(prev => ({ ...prev, [c.securityId]: v ? Number(v) : null }))}
                              clearable
                              searchable
                            />
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              )
            )}
          </Stack>
        )}

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
          <Switch
            label="Both directions (A→B and B→A)"
            checked={bidirectional}
            onChange={e => setBidirectional(e.currentTarget.checked)}
            mt="xl"
          />
        </Group>

        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {mode === 'matching'
              ? `${Object.values(pairings).filter(v => v != null).length} pairs${bidirectional ? ' × 2' : ''} = `
              : `${selectedA.length} × ${selectedB.length}${bidirectional ? ' × 2' : ''} = `}
            <strong>{activePreview.length}</strong> relationships to create
          </Text>
          {activePreview.length > 0 && (
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
                  {activePreview.map((p, i) => (
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
          <Button color="green" onClick={handleSubmit} loading={submitting} disabled={activePreview.length === 0}>
            Create {activePreview.length > 0 ? activePreview.length : ''} Relationships
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default BulkCreateRelationshipModal;
