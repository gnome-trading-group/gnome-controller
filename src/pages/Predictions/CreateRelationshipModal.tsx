import { useState } from 'react';
import { Button, Group, Modal, NumberInput, Select, Stack, Text } from '@mantine/core';
import { ContractRelationshipType, CreateContractRelationship } from '../../types';
import { registryApi } from '../../utils/api';
import { useSecuritySearch } from '../../hooks/useAsyncSearch';

const RELATIONSHIP_TYPE_OPTIONS: { value: ContractRelationshipType; label: string }[] = [
  { value: 'EQUIVALENT', label: 'Equivalent' },
  { value: 'COMPLEMENT', label: 'Complement' },
  { value: 'IMPLIES', label: 'Implies' },
  { value: 'MUTUALLY_EXCLUSIVE', label: 'Mutually Exclusive' },

  { value: 'HEDGEABLE_WITH', label: 'Hedgeable With' },
];

interface CreateRelationshipModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateRelationshipModal({ opened, onClose, onCreated }: CreateRelationshipModalProps) {
  const [securityIdA, setSecurityIdA] = useState<number | null>(null);
  const [securityIdB, setSecurityIdB] = useState<number | null>(null);
  const [relationshipType, setRelationshipType] = useState<ContractRelationshipType | null>(null);
  const [confidence, setConfidence] = useState<number>(0.9);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const { options: optionsA } = useSecuritySearch(searchA);
  const { options: optionsB } = useSecuritySearch(searchB);

  const handleClose = () => {
    setSecurityIdA(null);
    setSecurityIdB(null);
    setRelationshipType(null);
    setConfidence(0.9);
    setError(null);
    setSearchA('');
    setSearchB('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!securityIdA || !securityIdB || !relationshipType) {
      setError('All fields are required.');
      return;
    }
    if (securityIdA === securityIdB) {
      setError('Security A and Security B must be different.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: CreateContractRelationship = {
        securityIdA,
        securityIdB,
        relationshipType,
        confidence,
        method: 'manual',
      };
      await registryApi.createContractRelationship(body);
      onCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create relationship.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Create Manual Relationship" size="md">
      <Stack>
        <Select
          label="Security A"
          placeholder="Search by symbol..."
          data={optionsA}
          searchable
          searchValue={searchA}
          onSearchChange={setSearchA}
          value={securityIdA !== null ? String(securityIdA) : null}
          onChange={v => setSecurityIdA(v ? Number(v) : null)}
          nothingFoundMessage="No securities found"
        />
        <Select
          label="Security B"
          placeholder="Search by symbol..."
          data={optionsB}
          searchable
          searchValue={searchB}
          onSearchChange={setSearchB}
          value={securityIdB !== null ? String(securityIdB) : null}
          onChange={v => setSecurityIdB(v ? Number(v) : null)}
          nothingFoundMessage="No securities found"
        />
        <Select
          label="Relationship Type"
          placeholder="Select type"
          data={RELATIONSHIP_TYPE_OPTIONS}
          value={relationshipType}
          onChange={v => setRelationshipType(v as ContractRelationshipType | null)}
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
        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button color="green" onClick={handleSubmit} loading={submitting}>Create</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default CreateRelationshipModal;
