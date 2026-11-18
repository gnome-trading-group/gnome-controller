export const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia) (us-east-1)' },
  { value: 'us-east-2', label: 'US East (Ohio) (us-east-2)' },
  { value: 'us-west-1', label: 'US West (N. California) (us-west-1)' },
  { value: 'us-west-2', label: 'US West (Oregon) (us-west-2)' },
  { value: 'eu-west-1', label: 'EU (Ireland) (eu-west-1)' },
  { value: 'eu-west-2', label: 'EU (London) (eu-west-2)' },
  { value: 'eu-central-1', label: 'EU (Frankfurt) (eu-central-1)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo) (ap-northeast-1)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul) (ap-northeast-2)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore) (ap-southeast-1)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney) (ap-southeast-2)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai) (ap-south-1)' },
  { value: 'sa-east-1', label: 'South America (São Paulo) (sa-east-1)' },
];

/**
 * The zones each region's platform network has a subnet in, by name and ID, as gnome-shared-cdk's
 * PLATFORM_AVAILABILITY_ZONES lists them (the same names are the same IDs in dev and prod). Gateways, production shards
 * and sessions can only run in these; the registry refuses any other home zone, so a stale copy here fails safely.
 */
export const PLATFORM_ZONES: Readonly<Record<string, readonly { name: string; id: string }[]>> = {
  'us-east-1': [{ name: 'us-east-1a', id: 'use1-az2' }, { name: 'us-east-1b', id: 'use1-az4' }],
  'ap-northeast-1': [{ name: 'ap-northeast-1a', id: 'apne1-az4' }, { name: 'ap-northeast-1c', id: 'apne1-az1' }],
  'eu-west-1': [{ name: 'eu-west-1a', id: 'euw1-az2' }, { name: 'eu-west-1b', id: 'euw1-az3' }],
  'us-east-2': [{ name: 'us-east-2a', id: 'use2-az1' }, { name: 'us-east-2b', id: 'use2-az2' }],
};
