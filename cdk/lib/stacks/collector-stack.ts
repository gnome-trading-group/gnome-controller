import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import { ControllerConfig } from "../config";
import { OrchestratorLambda } from "@gnome-trading-group/gnome-shared-cdk";

export interface CollectorStackProps extends cdk.StackProps {
  config: ControllerConfig;
  collectorsMetadataTable: dynamodb.ITable;
}

/**
 * Global collector infrastructure stack (deployed only to primary region).
 * Contains S3 buckets and aggregator Lambda that are shared across all regions.
 */
export class CollectorStack extends cdk.Stack {
  public readonly rawBucket: s3.Bucket;
  public readonly archiveBucket: s3.Bucket;
  public readonly bucket: s3.Bucket;
  public readonly collectorOrchestratorVersion: string;
  public readonly aggregatorLambda: OrchestratorLambda;

  constructor(scope: Construct, id: string, props: CollectorStackProps) {
    super(scope, id, props);

    this.rawBucket = new s3.Bucket(this, 'CollectorRawBucket', {
      bucketName: `gnome-market-data-raw-${props.config.account.stage}`,
    });
    this.archiveBucket = new s3.Bucket(this, 'CollectorArchiveBucket', {
      bucketName: `gnome-market-data-archive-${props.config.account.stage}`,
    });

    this.bucket = new s3.Bucket(this, 'CollectorBucket', {
      bucketName: `gnome-market-data-${props.config.account.stage}`,
    });

    this.collectorOrchestratorVersion = props.config.collectorOrchestratorVersion;

    const aggregatorLogGroup = new logs.LogGroup(this, 'AggregatorLogGroup', {
      logGroupName: '/aws/lambda/market-data-aggregator',
      retention: logs.RetentionDays.ONE_WEEK,
    });

    this.aggregatorLambda = new OrchestratorLambda(this, 'CollectorAggregatorLambda', {
      orchestratorVersion: props.config.collectorOrchestratorVersion,
      classPath: 'group.gnometrading.collectors.AggregatorOrchestrator',
      lambdaName: 'CollectorAggregatorLambda',
      region: props.config.account.region,
      environmentVariables: {
        OUTPUT_BUCKET: this.bucket.bucketName,
        INPUT_BUCKET: this.rawBucket.bucketName,
        ARCHIVE_BUCKET: this.archiveBucket.bucketName,
        COLLECTORS_METADATA_TABLE: props.collectorsMetadataTable.tableName,
        STAGE: props.config.account.stage,
      },
      logGroup: aggregatorLogGroup,
    });

    this.rawBucket.grantReadWrite(this.aggregatorLambda.lambdaInstance);
    this.archiveBucket.grantReadWrite(this.aggregatorLambda.lambdaInstance);
    this.bucket.grantReadWrite(this.aggregatorLambda.lambdaInstance);

    const aggregatorRule = new events.Rule(this, 'CollectorAggregatorRule', {
      schedule: events.Schedule.rate(cdk.Duration.hours(3)),
    });
    // aggregatorRule.addTarget(new targets.LambdaFunction(aggregatorLambda.lambdaInstance));
  }
}
