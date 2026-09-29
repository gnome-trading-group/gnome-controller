import { useState, useEffect } from 'react';
import { Button, Group, JsonInput, Modal, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { controllerApi } from '../../utils/api';

const PIPELINE_CPU_OPTIONS = [256, 512, 1024, 2048, 4096] as const;

const PIPELINE_MEMORY_OPTIONS: Record<number, number[]> = {
  256:  [512, 1024, 2048],
  512:  [1024, 2048, 3072, 4096],
  1024: [2048, 3072, 4096, 5120, 6144, 7168, 8192],
  2048: [4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384],
  4096: [8192, 9216, 10240, 11264, 12288, 13312, 14336, 15360, 16384, 17408, 18432, 19456, 20480,
         21504, 22528, 23552, 24576, 25600, 26624, 27648, 28672, 29696, 30720],
};

function defaultForm() {
  return {
    pipelineName: '',
    description: '',
    schedule: '',
    scheduleEnabled: false,
    cpu: 1024,
    memory: 4096,
    parameters: '{}',
  };
}

interface PipelineFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function PipelineFormModal({ opened, onClose, onSaved }: PipelineFormModalProps) {
  const [form, setForm] = useState(defaultForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (opened) {
      setForm(defaultForm());
      setFormError(null);
    }
  }, [opened]);

  const handleSubmit = async () => {
    if (!form.pipelineName.trim()) {
      setFormError('Pipeline name is required');
      return;
    }

    let parameters: Record<string, unknown> = {};
    try {
      parameters = JSON.parse(form.parameters);
    } catch {
      setFormError('Parameters must be valid JSON');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await controllerApi.createPipeline({
        pipeline_name: form.pipelineName.trim(),
        description: form.description || undefined,
        schedule: form.schedule.trim() || undefined,
        schedule_enabled: form.scheduleEnabled,
        parameters,
        cpu: form.cpu,
        memory: form.memory,
      });
      onClose();
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create pipeline');
    } finally {
      setSubmitting(false);
    }
  };

  const memoryOptions = (PIPELINE_MEMORY_OPTIONS[form.cpu] ?? []).map(String);

  return (
    <Modal opened={opened} onClose={onClose} title="New Pipeline" size="md">
      <Stack>
        <TextInput
          label="Pipeline Name"
          placeholder="hltv_cs2"
          value={form.pipelineName}
          onChange={(e) => setForm((f) => ({ ...f, pipelineName: e.target.value }))}
          required
        />
        <TextInput
          label="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <TextInput
          label="Schedule"
          placeholder="rate(7 days)  or  cron(0 6 ? * MON *)"
          value={form.schedule}
          onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))}
        />
        <Switch
          label="Enable schedule"
          checked={form.scheduleEnabled}
          onChange={(e) => setForm((f) => ({ ...f, scheduleEnabled: e.currentTarget.checked }))}
          disabled={!form.schedule.trim()}
        />
        <Group grow>
          <Select
            label="CPU (vCPU units)"
            data={PIPELINE_CPU_OPTIONS.map(String)}
            value={String(form.cpu)}
            onChange={(v) => {
              const newCpu = Number(v ?? '1024');
              const validMemory = PIPELINE_MEMORY_OPTIONS[newCpu] ?? [];
              const newMemory = validMemory.includes(form.memory) ? form.memory : validMemory[Math.floor(validMemory.length / 2)];
              setForm((f) => ({ ...f, cpu: newCpu, memory: newMemory }));
            }}
          />
          <Select
            label="Memory (MiB)"
            data={memoryOptions}
            value={String(form.memory)}
            onChange={(v) => setForm((f) => ({ ...f, memory: Number(v ?? '4096') }))}
          />
        </Group>
        <JsonInput
          label="Parameters"
          value={form.parameters}
          onChange={(v) => setForm((f) => ({ ...f, parameters: v }))}
          validationError="Invalid JSON"
          formatOnBlur
          autosize
          minRows={2}
        />
        {formError && <Text c="red" size="sm">{formError}</Text>}
        <Group justify="flex-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting}>Create</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default PipelineFormModal;
