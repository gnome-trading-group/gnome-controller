import { useState } from 'react';
import { Button, Group, Modal, MultiSelect, Stack, TagsInput, Text } from '@mantine/core';
import { registryApi } from '../../utils/api';
import { useSecuritySearch } from '../../hooks/useAsyncSearch';

interface CreateHedgeKeywordModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateHedgeKeywordModal({ opened, onClose, onCreated }: CreateHedgeKeywordModalProps) {
  const [securityIds, setSecurityIds] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<string, string>>({});
  const [keywords, setKeywords] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { options } = useSecuritySearch(search);

  // Keep selected items in the data prop even when search results change
  const mergedData = [
    ...Object.entries(selectedItems)
      .filter(([id]) => !options.some(o => o.value === id))
      .map(([id, label]) => ({ value: id, label })),
    ...options,
  ];

  const handleSecurityChange = (values: string[]) => {
    setSecurityIds(values);
    const updated = { ...selectedItems };
    for (const v of values) {
      if (!updated[v]) {
        const opt = options.find(o => o.value === v);
        if (opt) updated[v] = opt.label;
      }
    }
    for (const key of Object.keys(updated)) {
      if (!values.includes(key)) delete updated[key];
    }
    setSelectedItems(updated);
  };

  const handleClose = () => {
    setSecurityIds([]);
    setSelectedItems({});
    setKeywords([]);
    setError(null);
    setSearch('');
    onClose();
  };

  const handleSubmit = async () => {
    if (securityIds.length === 0 || keywords.length === 0) {
      setError('At least one security and one keyword are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const pairs = securityIds.flatMap(sid =>
      keywords.map(kw => ({ securityId: Number(sid), keyword: kw.trim().toLowerCase() }))
    );
    const results = await Promise.allSettled(
      pairs.map(body => registryApi.createHedgeKeyword(body))
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    setSubmitting(false);
    if (failed < pairs.length) onCreated();
    if (failed > 0) {
      setError(`${pairs.length - failed} created, ${failed} failed (duplicates?).`);
    } else {
      handleClose();
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add Hedge Keywords" size="md">
      <Stack>
        <MultiSelect
          label="Securities"
          placeholder="Search by symbol..."
          data={mergedData}
          searchable
          searchValue={search}
          onSearchChange={setSearch}
          value={securityIds}
          onChange={handleSecurityChange}
          nothingFoundMessage="No securities found"
        />
        <TagsInput
          label="Keywords"
          placeholder="Type a keyword and press Enter"
          value={keywords}
          onChange={setKeywords}
          description="Case-insensitive. Each keyword will be stored lowercase."
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
