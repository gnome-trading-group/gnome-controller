import { ReactNode } from 'react';
import { IconAlertOctagon, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { AlertSeverity } from '../../types';

// Styled like the dashboard's Needs attention list, so an alert reads the same wherever it shows up.
export const SEVERITY_STYLE: Record<AlertSeverity, { color: string; icon: ReactNode }> = {
  CRITICAL: { color: 'red', icon: <IconAlertOctagon size={13} /> },
  ERROR: { color: 'orange', icon: <IconAlertTriangle size={13} /> },
  WARNING: { color: 'yellow', icon: <IconAlertTriangle size={13} /> },
  INFO: { color: 'blue', icon: <IconInfoCircle size={13} /> },
};
