import * as ec2 from "aws-cdk-lib/aws-ec2";

// Backtests and research jobs are both CPU-bound. c7a/m7a give one physical core per vCPU; c7i/m7i are the fastest
// Intel; 6th-generation types stay as fallbacks so spot capacity never runs dry. c5/m5 ran a monthly fit about 2.5x
// slower than a laptop, and cost no less on spot, so they are not offered.
export const BATCH_SPOT_INSTANCE_TYPES: ec2.InstanceType[] = [
  ec2.InstanceClass.C7A, ec2.InstanceClass.M7A, ec2.InstanceClass.C7I, ec2.InstanceClass.M7I,
  ec2.InstanceClass.C6I, ec2.InstanceClass.M6I,
].flatMap((cls) => [ec2.InstanceSize.XLARGE, ec2.InstanceSize.XLARGE2, ec2.InstanceSize.XLARGE4]
  .map((size) => ec2.InstanceType.of(cls, size)));
