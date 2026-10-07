import { PnlSeries } from '../types';

// Appends a poll's points to a series: the poll starts at the newest point already shown (that point may have moved
// since), so everything from there on is replaced. Events are keyed by time, kind and session.
export function mergeSeries(previous: PnlSeries, tail: PnlSeries): PnlSeries {
  if (tail.t.length === 0) return previous;
  const keep = previous.t.findIndex(t => t >= tail.t[0]);
  const cut = keep === -1 ? previous.t.length : keep;
  const join = <T,>(a: T[], b: T[]) => [...a.slice(0, cut), ...b];
  const listings = tail.listings.map(listing => {
    const before = previous.listings.find(l => l.listingId === listing.listingId);
    // A listing first seen in this poll had nothing before it; pad so every array lines up with t.
    const pad = (values: string[] | undefined) => values ? values.slice(0, cut) : Array<string>(cut).fill('0');
    return {
      ...listing,
      total: [...pad(before?.total), ...listing.total],
      netQuantity: [...pad(before?.netQuantity), ...listing.netQuantity],
    };
  });
  const eventKey = (e: PnlSeries['events'][number]) => `${e.time}/${e.kind}/${e.sessionId}/${e.listingId}`;
  const seen = new Set(previous.events.map(eventKey));
  return {
    resolutionMs: previous.resolutionMs,
    t: join(previous.t, tail.t),
    total: join(previous.total, tail.total),
    realized: join(previous.realized, tail.realized),
    unrealized: join(previous.unrealized, tail.unrealized),
    fees: join(previous.fees, tail.fees),
    listings,
    events: [...previous.events, ...tail.events.filter(e => !seen.has(eventKey(e)))],
  };
}
