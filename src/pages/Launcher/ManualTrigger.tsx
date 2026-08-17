import { useState, useEffect, useCallback } from 'react';
import { Alert, Button, Container, Group, Select, Stack, Text, Title } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { RuleType } from '../../types/launcher';
import { launcherApi } from '../../utils/api';
import { SchemaFormFields } from '../../components/SchemaFormFields';

function ManualTrigger() {
  const [ruleTypes, setRuleTypes] = useState<RuleType[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    launcherApi.getRuleTypes()
      .then(setRuleTypes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selected = ruleTypes.find(rt => rt.type === selectedType);
  const schema = selected?.data_schema;

  const handleTypeChange = (value: string | null) => {
    setSelectedType(value);
    setData({});
    setSuccess(null);
    setError(null);
  };

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = async () => {
    if (!selectedType) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined && v !== '' && v !== null)
      );
      await launcherApi.submitTrigger({ rule_type: selectedType, data: cleanData });
      setSuccess(`Trigger submitted for "${selected?.display_name ?? selectedType}"`);
      setData({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit trigger');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Manual Trigger</Title>
      </Group>

      <Stack gap="sm">
        {success && (
          <Alert color="green" icon={<IconCheck size={16} />} onClose={() => setSuccess(null)} withCloseButton>
            {success}
          </Alert>
        )}
        {error && (
          <Alert color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        <Select
          label="Rule Type"
          placeholder="Select a rule type..."
          required
          data={ruleTypes.map(rt => ({ value: rt.type, label: rt.display_name }))}
          value={selectedType}
          onChange={handleTypeChange}
          disabled={loading}
        />

        {schema?.properties && (
          <>
            <Text size="sm" fw={600} mt="xs">Trigger Data</Text>
            <SchemaFormFields
              properties={schema.properties}
              required={schema.required ?? []}
              values={data}
              onChange={handleFieldChange}
            />
          </>
        )}

        <Button
          mt="sm"
          onClick={handleSubmit}
          loading={submitting}
          disabled={!selectedType}
        >
          Submit Trigger
        </Button>
      </Stack>
    </Container>
  );
}

export default ManualTrigger;
