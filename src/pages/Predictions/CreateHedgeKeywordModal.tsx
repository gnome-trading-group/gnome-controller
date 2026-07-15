import { useState } from 'react';
import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { CreateHedgeKeyword } from '../../types';
import { registryApi } from '../../utils/api';
import { useSecuritySearch } from '../../hooks/useAsyncSearch';

interface CreateHedgeKeywordModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateHedgeKeywordModal({ opened, onClose, onCreated }: CreateHedgeKeywordModalProps) {
  const [securityId, setSecurityId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { options } = useSecuritySearch(search);

  const handleClose = () => {
    setSecurityId(null);
    setKeyword('');
    setError(null);
    setSearch('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!securityId || !keyword.trim()) {
      setError('Security and keyword are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: CreateHedgeKeyword = { securityId, keyword: keyword.trim().toLowerCase() };
      await registryApi.createHedgeKeyword(body);
      onCreated();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create hedge keyword.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add Hedge Keyword" size="md">
      <Stack>
        <Select
          label="Security"
          placeholder="Search by symbol..."
          data={options}
          searchable
          searchValue={search}
          onSearchChange={setSearch}
          value={securityId !== null ? String(securityId) : null}
          onChange={v => setSecurityId(v ? Number(v) : null)}
          nothingFoundMessage="No securities found"
        />
        <TextInput
          label="Keyword"
          placeholder="e.g. ethereum"
          value={keyword}
          onChange={e => setKeyword(e.currentTarget.value)}
          description="Case-insensitive. Will be stored lowercase."
        />
        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button color="green" onClick={handleSubmit} loading={submitting}>Add</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default CreateHedgeKeywordModal;
