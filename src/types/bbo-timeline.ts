export interface BboDataPoint {
  timestamp: number;
  bidPrice: number;
  askPrice: number;
  midPrice: number;
}

export interface BboTimelineResponse {
  listingId: number;
  dataPoints: BboDataPoint[];
}
