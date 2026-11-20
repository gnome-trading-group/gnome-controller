import { Loader } from '@mantine/core';
import { IconCheck, IconCircleDashed, IconHandStop, IconPlayerStop, IconX } from '@tabler/icons-react';

// How a pipeline stage's status is drawn, wherever the System page shows stages.
export interface StageLook {
  color: string;
  icon: React.ReactNode;
  label: string;
}

export function look(status: string | null, waiting: boolean): StageLook {
  if (waiting) return { color: 'orange', icon: <IconHandStop size={13} />, label: 'waiting for approval' };
  switch (status) {
    case 'Succeeded': return { color: 'teal', icon: <IconCheck size={13} />, label: 'succeeded' };
    case 'Failed': return { color: 'red', icon: <IconX size={13} />, label: 'failed' };
    case 'InProgress': return { color: 'blue', icon: <Loader size={11} color="blue" />, label: 'running' };
    case 'Stopped':
    case 'Stopping':
    case 'Cancelled': return { color: 'gray', icon: <IconPlayerStop size={13} />, label: status.toLowerCase() };
    default: return { color: 'gray', icon: <IconCircleDashed size={13} />, label: 'not run' };
  }
}
