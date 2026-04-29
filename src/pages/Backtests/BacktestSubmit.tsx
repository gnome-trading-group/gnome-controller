import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import { DateTimePicker } from '@mantine/dates';
import { IconArrowLeft } from '@tabler/icons-react';
import { controllerApi } from '../../utils/api';
import type { BacktestPreset } from '../../types/backtests';

function formatDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function patchYamlField(yaml: string, key: string, value: string): string {
  const regex = new RegExp(`^(${key}:\\s*).+$`, 'm');
  if (regex.test(yaml)) {
    return yaml.replace(regex, `$1${value}`);
  }
  return yaml.trimEnd() + `\n${key}: ${value}\n`;
}

function patchYamlDates(yaml: string, start: Date | null, end: Date | null): string {
  let patched = yaml;
  if (start) {
    patched = patchYamlField(patched, 'start_date', formatDateTime(start));
  }
  if (end) {
    patched = patchYamlField(patched, 'end_date', formatDateTime(end));
  }
  return patched;
}

interface LocationState {
  config?: string;
  researchCommit?: string;
  presetId?: string;
  presetName?: string;
}

function parseDateFromYaml(yaml: string, key: string): Date | null {
  const match = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) return null;
  const parsed = new Date(match[1].trim());
  return isNaN(parsed.getTime()) ? null : parsed;
}

function BacktestSubmit() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as LocationState) || {};

  const [presets, setPresets] = useState<BacktestPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(prefill.presetId || null);
  const [configOverride, setConfigOverride] = useState(prefill.config || '');
  const [startDate, setStartDate] = useState<Date | null>(
    prefill.config ? parseDateFromYaml(prefill.config, 'start_date') : null,
  );
  const [endDate, setEndDate] = useState<Date | null>(
    prefill.config ? parseDateFromYaml(prefill.config, 'end_date') : null,
  );
  const [backtestName, setBacktestName] = useState(prefill.presetName || '');
  const [researchCommit, setResearchCommit] = useState(prefill.researchCommit || 'main');
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

  // When preset changes, populate the editable config, dates, and name.
  useEffect(() => {
    if (selectedPreset) {
      setConfigOverride(selectedPreset.config);
      setStartDate(parseDateFromYaml(selectedPreset.config, 'start_date'));
      setEndDate(parseDateFromYaml(selectedPreset.config, 'end_date'));
      if (!backtestName) {
        setBacktestName(selectedPreset.name);
      }
    }
  }, [selectedPresetId]);

  const handleSubmit = async () => {
    if (!configOverride.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const finalConfig = patchYamlDates(configOverride, startDate, endDate);
      const response = await controllerApi.submitBacktest({
        presetId: selectedPresetId || undefined,
        config: finalConfig,
        researchCommit: researchCommit || 'main',
        name: backtestName || undefined,
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
        <TextInput
          label="Name"
          description="A label to identify this run (e.g. 'BTC momentum Jan test')"
          placeholder="Optional"
          value={backtestName}
          onChange={(e) => setBacktestName(e.currentTarget.value)}
        />

        <Select
          label="Preset"
          description="Optional — load a saved config as a starting point"
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

        <Group grow>
          <DateTimePicker
            label="Start"
            description="Overrides start_date in config"
            placeholder="From config"
            value={startDate}
            onChange={setStartDate}
            clearable
            valueFormat="YYYY-MM-DD HH:mm"
          />
          <DateTimePicker
            label="End"
            description="Overrides end_date in config"
            placeholder="From config"
            value={endDate}
            onChange={setEndDate}
            clearable
            valueFormat="YYYY-MM-DD HH:mm"
          />
        </Group>

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
