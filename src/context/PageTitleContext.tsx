import React, { createContext, useContext, useEffect, useState } from 'react';

export interface TitleLabel {
  segment: string | undefined;
  label: string | null | undefined;
}

interface PageTitleState {
  labels: TitleLabel[];
  setLabels: (labels: TitleLabel[]) => void;
}

const PageTitleContext = createContext<PageTitleState | undefined>(undefined);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<TitleLabel[]>([]);
  return (
    <PageTitleContext.Provider value={{ labels, setLabels }}>
      {children}
    </PageTitleContext.Provider>
  );
}

function usePageTitleContext() {
  const context = useContext(PageTitleContext);
  if (context === undefined) {
    throw new Error('usePageTitleContext must be used within a PageTitleProvider');
  }
  return context;
}

// Labels must be given in URL order: two IDs on one route can share a value (security 3 on exchange 3), so they are
// matched positionally rather than looked up by value.
export function usePageTitleLabels(labels: TitleLabel[]) {
  const { setLabels } = usePageTitleContext();
  const key = JSON.stringify(labels);

  useEffect(() => {
    setLabels(JSON.parse(key));
    return () => setLabels([]);
  }, [key, setLabels]);
}

export function useRegisteredTitleLabels(): TitleLabel[] {
  return usePageTitleContext().labels;
}
