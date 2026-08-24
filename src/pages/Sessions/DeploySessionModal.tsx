import { useState, useEffect, useCallback } from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Strategy } from '../../types';
import { registryApi } from '../../utils/api';
import SimulationConfigForm, {
  defaultSimulationState,
  simulationStateFromConfig,
  simulationStateToConfig,
  SimulationState,
} from '../../components/SimulationConfigForm';

interface ParamRow {
  key: string;
  value: string;
}

interface DeploySessionModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
  preselectedStrategyId?: number;
}

const MODE_OPTIONS = [
  { value: 'paper', label: 'Paper' },
  { value: 'live', label: 'Live' },
];

const STRATEGY_TYPE_OPTIONS = [
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
];

function flattenToSessionConfig(
  strategyId: string,
  mode: string,
  strategyType: string | null,
  strategyClass: string,
  listings: string,
  researchCommit: string,
  region: string,
  params: ParamRow[],
  sim: SimulationState,
): Record<string, string> {
  const config: Record<string, string> = {
    'strategy.id': strategyId,
    mode,
    listings: listings.trim(),
  };
  if (strategyType) {
    config['strategy.type'] = strategyType;
    if (strategyClass.trim()) config['strategy.class'] = strategyClass.trim();
  }
  if (researchCommit.trim()) config['research_commit'] = researchCommit.trim();
  if (region.trim()) config['region'] = region.trim();
  for (const { key, value } of params) {
    if (key.trim()) config[`strategy.args.${key.trim()}`] = value;
  }
  if (mode === 'paper') {
    const simCfg = simulationStateToConfig(sim);
    for (const [k, v] of Object.entries(simCfg)) {
      config[`simulation.${k}`] = v;
    }
  }
  return config;
}

function DeploySessionModal({ opened, onClose, onCreated, preselectedStrategyId }: DeploySessionModalProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [strategyId, setStrategyId] = useState<string | null>(
    preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null
  );
  const [mode, setMode] = useState<string>('paper');
  const [listings, setListings] = useState('');
  const [researchCommit, setResearchCommit] = useState('');
  const [region, setRegion] = useState('');
  const [strategyType, setStrategyType] = useState<string | null>(null);
  const [strategyClass, setStrategyClass] = useState('');
  const [params, setParams] = useState<ParamRow[]>([]);
  const [sim, setSim] = useState<SimulationState>(defaultSimulationState());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    registryApi.listStrategies().then(setStrategies).catch(() => {});
  }, []);

  useEffect(() => {
    if (preselectedStrategyId !== undefined) {
      setStrategyId(String(preselectedStrategyId));
    }
  }, [preselectedStrategyId]);

  const loadStrategyDefaults = useCallback((strategy: Strategy) => {
    const p = strategy.parameters as Record<string, unknown> | undefined;
    if (!p) return;
    if (p.mode) setMode(String(p.mode));
    if (p.strategy_type) setStrategyType(String(p.strategy_type));
    if (p.strategy_class) setStrategyClass(String(p.strategy_class));
    if (p.listings) setListings(String(p.listings));
    if (p.region) setRegion(String(p.region));
    if (p.research_commit) setResearchCommit(String(p.research_commit));
    if (p.args && typeof p.args === 'object') {
      const entries = Object.entries(p.args as Record<string, unknown>);
      setParams(entries.map(([k, v]) => ({ key: k, value: String(v) })));
    }
    if (p.simulation && typeof p.simulation === 'object') {
      setSim(simulationStateFromConfig(p.simulation as Record<string, string>));
    }
  }, []);

  const handleStrategyChange = useCallback((value: string | null) => {
    setStrategyId(value);
    if (!value) {
      setParams([]);
      return;
    }
    const strategy = strategies.find(s => String(s.strategyId) === value);
    if (strategy) loadStrategyDefaults(strategy);
    else setParams([]);
  }, [strategies, loadStrategyDefaults]);

  useEffect(() => {
    if (preselectedStrategyId !== undefined) {
      const strategy = strategies.find(s => s.strategyId === preselectedStrategyId);
      if (strategy) loadStrategyDefaults(strategy);
    }
  }, [strategies, preselectedStrategyId, loadStrategyDefaults]);

  const resetForm = () => {
    setStrategyId(preselectedStrategyId !== undefined ? String(preselectedStrategyId) : null);
    setMode('paper');
    setListings('');
    setResearchCommit('');
    setRegion('');
    setStrategyType(null);
    setStrategyClass('');
    setParams([]);
    setSim(defaultSimulationState());
    setError(null);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSubmit = async () => {
    setError(null);
    if (!strategyId) { setError('Strategy is required'); return; }
    if (!listings.trim()) { setError('Listings are required'); return; }

    const config = flattenToSessionConfig(strategyId, mode, strategyType, strategyClass, listings, researchCommit, region, params, sim);

    setSubmitting(true);
    try {
      await registryApi.createSession({
        sessionId: crypto.randomUUID(),
        strategyId: parseInt(strategyId),
        mode,
        config,
        researchCommit: researchCommit.trim() || undefined,
        region: region.trim() || undefined,
      });
      onCreated();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deploy session');
    } finally {
      setSubmitting(false);
    }
  };

  const strategyOptions = strategies.map(s => ({ value: String(s.strategyId), label: s.name }));

  return (
    <Modal opened={opened} onClose={handleClose} title="Deploy Strategy Session" size="lg">
      <Stack gap="sm">
        <Title order={6} c="dimmed">Core</Title>
        <Select
          label="Strategy"
          data={strategyOptions}
          value={strategyId}
          onChange={handleStrategyChange}
          required
          disabled={preselectedStrategyId !== undefined}
          searchable
        />
        <Select label="Mode" data={MODE_OPTIONS} value={mode} onChange={v => setMode(v ?? 'paper')} required />
        <TextInput label="Listings" placeholder="e.g. 1,2,3" value={listings} onChange={e => setListings(e.currentTarget.value)} required />
        <TextInput label="Research Commit" placeholder="git SHA or branch (optional)" value={researchCommit} onChange={e => setResearchCommit(e.currentTarget.value)} />
        <TextInput label="Region Override" placeholder="e.g. us-east-1 (optional)" value={region} onChange={e => setRegion(e.currentTarget.value)} />

        <Divider />
        <Title order={6} c="dimmed">Strategy Class</Title>
        <Select label="Strategy Type" data={STRATEGY_TYPE_OPTIONS} value={strategyType} onChange={setStrategyType} clearable placeholder="Auto-detect" />
        <TextInput label="Strategy Class" placeholder="com.example.MyStrategy or module:ClassName" value={strategyClass} onChange={e => setStrategyClass(e.currentTarget.value)} />

        <Divider />
        <Group justify="space-between">
          <Title order={6} c="dimmed">Strategy Parameters</Title>
          <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => setParams(p => [...p, { key: '', value: '' }])}>
            <IconPlus size={14} />
          </ActionIcon>
        </Group>
        {params.map((row, i) => (
          <Group key={i} gap="xs" align="flex-end">
            <TextInput placeholder="key" value={row.key} onChange={e => setParams(p => p.map((r, j) => j === i ? { ...r, key: e.currentTarget.value } : r))} style={{ flex: 1 }} />
            <TextInput placeholder="value" value={row.value} onChange={e => setParams(p => p.map((r, j) => j === i ? { ...r, value: e.currentTarget.value } : r))} style={{ flex: 1 }} />
            <ActionIcon variant="subtle" color="red" onClick={() => setParams(p => p.filter((_, j) => j !== i))}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}

        {mode === 'paper' && <SimulationConfigForm sim={sim} onChange={setSim} />}

        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button color="green" loading={submitting} onClick={handleSubmit}>Deploy</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default DeploySessionModal;
