import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

// The research datasets and artifact index (gnome-pipelines DataStack owns the table bucket).
const RESEARCH_TABLE_BUCKET = "gnome-research-tables";
const TABLE_READ_ACTIONS = [
  "s3tables:GetTableBucket",
  "s3tables:GetNamespace",
  "s3tables:ListNamespaces",
  "s3tables:ListTables",
  "s3tables:GetTable",
  "s3tables:GetTableMetadataLocation",
  "s3tables:GetTableData",
];

/**
 * Lets a role read the research datasets as gnomepy.data's DatasetStore does: the tables in the research table
 * bucket, and the parameters it finds that bucket and the artifact root through.
 */
export function grantResearchDatasetRead(stack: cdk.Stack, role: iam.IRole): void {
  const tableBucketArn = `arn:aws:s3tables:${stack.region}:${stack.account}:bucket/${RESEARCH_TABLE_BUCKET}`;
  role.addToPrincipalPolicy(new iam.PolicyStatement({
    actions: TABLE_READ_ACTIONS,
    resources: [tableBucketArn, `${tableBucketArn}/table/*`],
  }));
  role.addToPrincipalPolicy(new iam.PolicyStatement({
    actions: ["ssm:GetParameters"],
    resources: [`arn:aws:ssm:${stack.region}:${stack.account}:parameter/gnome/research/*`],
  }));
}
