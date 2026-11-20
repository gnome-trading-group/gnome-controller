import { ReactNode } from 'react';
import { Volume } from '../../types';
import { volumeSummary } from '../../utils/volume';
import { Kpi } from './layout';
import { Money } from './values';

const HINT = 'Money traded in venue fills (quantity × price). Settlements, resets, corrections and trades booked by hand '
  + "don't count. Maker is the share of fills that rested on the book, of those the venue said which.";

interface VolumeKpiProps {
  label: string;
  volume: Volume | undefined;
  // Said after the fills, such as the orders behind them.
  extra?: ReactNode;
}

export function VolumeKpi({ label, volume, extra }: VolumeKpiProps) {
  const summary = volumeSummary(volume);
  return (
    <Kpi
      label={label}
      hint={HINT}
      value={<Money value={volume?.notional} pnl={false} />}
      footer={volume && <>{summary}{extra && <> · {extra}</>} · fees <Money value={volume.fees} pnl={false} size="xs" /></>}
    />
  );
}
