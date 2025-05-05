import { useState, useEffect } from 'react';
import { collectorsApi } from '../../utils/api';
import { ApiError } from '../../utils/api';

interface Collector {
  listingId: number;
  lastHeartbeat: string;
}

function MarketData() {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCollectors();
  }, []);

  const loadCollectors = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await collectorsApi.list();
      setCollectors(response.collectors);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load collectors');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollector = async (listingId: number) => {
    try {
      setError(null);
      await collectorsApi.create(listingId);
      await loadCollectors();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create collector');
      }
    }
  };

  const handleDeleteCollector = async (listingId: number) => {
    try {
      setError(null);
      await collectorsApi.delete(listingId);
      await loadCollectors();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to delete collector');
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      
      <h2>Active Collectors</h2>
      <ul>
        {collectors.map(collector => (
          <li key={collector.listingId}>
            Listing ID: {collector.listingId}
            <br />
            Last Heartbeat: {new Date(collector.lastHeartbeat).toLocaleString()}
            <button onClick={() => handleDeleteCollector(collector.listingId)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
} 

export default MarketData;