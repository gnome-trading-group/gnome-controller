export interface StrategyClassHint {
  placeholder: string;
  description: string;
}

// Python classes go through gnomepy's runner, which only accepts 'module.path:ClassName'; Java classes are loaded by
// the orchestrator by fully qualified name.
export function strategyClassHint(strategyType: string | null): StrategyClassHint {
  if (strategyType === 'python') {
    return {
      placeholder: 'gnomepy_research.strategies.market_maker:MarketMaker',
      description: "Python import path and class, separated by ':' (module.path:ClassName)",
    };
  }
  if (strategyType === 'java') {
    return {
      placeholder: 'group.gnometrading.strategies.MyStrategy',
      description: 'Fully qualified Java class name',
    };
  }
  return { placeholder: 'Pick a strategy type first', description: 'Depends on the strategy type' };
}

export function strategyClassError(strategyType: string | null, strategyClass: string): string | null {
  if (strategyType === 'python' && !strategyClass.includes(':')) {
    return "Python strategy class must be 'module.path:ClassName'";
  }
  return null;
}
