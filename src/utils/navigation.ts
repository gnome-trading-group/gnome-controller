import type { NavigateFunction } from 'react-router-dom';
import type React from 'react';

export function navigateRowProps(navigate: NavigateFunction, path: string) {
  return {
    onClick: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) {
        window.open(path, '_blank');
        return;
      }
      navigate(path);
    },
    onAuxClick: (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        window.open(path, '_blank');
      }
    },
    style: { cursor: 'pointer' },
  };
}

export function handleNavigateClick(
  e: React.MouseEvent,
  navigate: NavigateFunction,
  path: string,
): void {
  if (e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey) {
    window.open(path, '_blank');
    return;
  }
  navigate(path);
}
