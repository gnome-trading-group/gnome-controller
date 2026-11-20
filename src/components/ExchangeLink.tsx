import { ReactNode } from 'react';
import { Anchor, MantineSize } from '@mantine/core';
import { Link } from 'react-router-dom';

// An exchange's name wherever it's shown, leading to its page. Clicks stop here, so a clickable row around it doesn't
// navigate as well.
export function ExchangeLink({ exchangeId, children, size = 'sm', fw }: {
  exchangeId: number; children: ReactNode; size?: MantineSize; fw?: number;
}) {
  return (
    <Anchor
      component={Link}
      to={`/security-master/exchanges/${exchangeId}`}
      size={size}
      fw={fw}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </Anchor>
  );
}
