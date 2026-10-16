import { useEffect } from 'react';
import { LaunchSettings } from '../utils/launch-settings';
import { defaultLatencyProfile, isInstanceTypeValidFor, suggestInstanceType } from '../utils/sizing';

// Keeps the latency profile following the mode, and the instance type following the profile and listing count, until
// someone chooses them (see LaunchSettings).
export function useLaunchSizing(
  settings: LaunchSettings, onChange: (patch: Partial<LaunchSettings>) => void, listingCount: number,
) {
  useEffect(() => {
    if (settings.latencyProfileChosen) return;
    const profile = defaultLatencyProfile(settings.mode);
    if (profile !== settings.latencyProfile) onChange({ latencyProfile: profile });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode, settings.latencyProfileChosen]);
  useEffect(() => {
    if (settings.instanceTypeChosen && isInstanceTypeValidFor(settings.latencyProfile, settings.instanceType)) return;
    const suggested = suggestInstanceType(settings.latencyProfile, settings.mode, listingCount);
    if (suggested !== settings.instanceType) onChange({ instanceType: suggested });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode, settings.latencyProfile, settings.instanceType, settings.instanceTypeChosen, listingCount]);
}
