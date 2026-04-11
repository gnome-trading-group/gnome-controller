import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Select,
  TextInput,
  Textarea,
  Button,
  Stack,
  Text,
  Notification,
  Group,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { controllerApi } from '../../utils/api';
import type { BacktestPreset } from '../../types/backtests';

function BacktestSubmit() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<BacktestPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [configOverride, setConfigOverride] = useState('');
  const [researchCommit, setResearchCommit] = useState('main');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await controllerApi.listPresets();
        setPresets(response.presets);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load presets');
      } finally {
        setLoadingPresets(false);
      }
    })();
  }, []);

  const selectedPreset = presets.find((p) => p.presetId === selectedPresetId);

  // When preset changes, populate the editable config.
  useEffect(() => {
    if (selectedPreset) {
      setConfigOverride(selectedPreset.config);
    }
  }, [selectedPresetId]);

  const handleSubmit = async () => {
    if (!configOverride.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const response = await controllerApi.submitBacktest({
        presetId: selectedPresetId || undefined,
        config: configOverride,
        researchCommit: researchCommit || 'main',
      });
      navigate(`/backtests/${response.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit backtest');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size="md">
      <Group mb="md">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate('/backtests')}
        >
          Back
        </Button>
      </Group>

      <Title order={2} mb="lg">
        New Backtest
      </Title>

      {error && (
        <Notification color="red" onClose={() => setError(null)} mb="md">
          {error}
        </Notification>
      )}

      <Stack gap="md">
        <Select
          label="Preset"
          placeholder={loadingPresets ? 'Loading presets...' : 'Select a preset'}
          data={presets.map((p) => ({ value: p.presetId, label: p.name }))}
          value={selectedPresetId}
          onChange={setSelectedPresetId}
          disabled={loadingPresets}
          searchable
        />

        <TextInput
          label="Research Commit"
          description="Git SHA or ref of gnomepy-research to check out"
          placeholder="main"
          value={researchCommit}
          onChange={(e) => setResearchCommit(e.currentTarget.value)}
        />

        {selectedPreset?.description && (
          <Text size="sm" c="dimmed">
            {selectedPreset.description}
          </Text>
        )}

        <Textarea
          label="Config (YAML)"
          description={selectedPreset ? 'Loaded from preset — edit before submitting' : 'Paste a YAML config or select a preset above'}
          value={configOverride}
          onChange={(e) => setConfigOverride(e.currentTarget.value)}
          minRows={14}
          autosize
          maxRows={30}
          styles={{ input: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
        />

        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!configOverride.trim() || submitting}
          loading={submitting}
        >
          {submitting ? 'Submitting...' : 'Run Backtest'}
        </Button>
      </Stack>
    </Container>
  );
}

export default BacktestSubmit;
