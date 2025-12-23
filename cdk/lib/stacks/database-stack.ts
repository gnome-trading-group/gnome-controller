import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class DatabaseStack extends cdk.Stack {
  public readonly collectorsTable: dynamodb.Table;
  public readonly collectorsMetadataTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.collectorsTable = new dynamodb.Table(this, "CollectorsTable", {
      tableName: "gnome-collectors",
      partitionKey: { name: "listingId", type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    this.collectorsMetadataTable = new dynamodb.Table(this, "CollectorsMetadataTable", {
      tableName: "gnome-collectors-metadata",
      partitionKey: { name: "listingId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "schemaType", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });
  }
} 