import { StrategySessionStatus } from '../types';

// Keyed by the enum so adding a status fails to compile until it has a colour.
export const SESSION_STATUS_COLORS: Record<StrategySessionStatus, string> = {
  [StrategySessionStatus.SUBMITTED]: 'blue',
  [StrategySessionStatus.STARTING]: 'cyan',
  [StrategySessionStatus.RUNNING]: 'green',
  [StrategySessionStatus.STOPPED]: 'gray',
  [StrategySessionStatus.FAILED]: 'red',
};
