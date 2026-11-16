import { useEffect } from 'react';
import { LaunchSettings } from '../utils/launch-settings';
import { AUTO_INSTANCE_TYPE, isInstanceTypeValidFor } from '../utils/sizing';

// A chosen instance type the tier can't run (a standard-only size once low latency is picked) goes back to automatic,
// which the registry sizes for the tier and the session's listings at launch.
export function useLaunchSizing(settings: LaunchSettings, onChange: (patch: Partial<LaunchSettings>) => void) {
  useEffect(() => {
    if (isInstanceTypeValidFor(settings.tier, settings.instanceType)) return;
    onChange({ instanceType: AUTO_INSTANCE_TYPE, instanceTypeChosen: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.tier, settings.instanceType]);
}
