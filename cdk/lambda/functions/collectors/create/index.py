import os
import boto3
from db import DynamoDBClient
from utils import lambda_handler

@lambda_handler
def handler(body):
    listing_id = int(body['listingId'])

    ecs = boto3.client('ecs')
    cluster = os.environ['COLLECTOR_ECS_CLUSTER']
    base_task_definition = os.environ['COLLECTOR_ECS_TASK_DEFINITION']
    security_group_id = os.environ['COLLECTOR_SECURITY_GROUP_ID']
    subnet_ids = os.environ['COLLECTOR_SUBNET_IDS'].split(',')
    deployment_version = os.environ.get('COLLECTOR_DEPLOYMENT_VERSION', 'unknown')

    service_name = f'collector-{listing_id}'

    try:
        db = DynamoDBClient()

        # Get the base task definition to create a collector-specific version
        base_task_def_response = ecs.describe_task_definition(taskDefinition=base_task_definition)
        base_task_def = base_task_def_response['taskDefinition']

        # Create a new task definition for this specific collector with LISTING env var
        container_def = base_task_def['containerDefinitions'][0].copy()

        # Add LISTING to environment variables
        if 'environment' not in container_def:
            container_def['environment'] = []
        container_def['environment'].append({
            'name': 'LISTING',
            'value': str(listing_id)
        })

        # Register a new task definition for this collector
        collector_task_def_response = ecs.register_task_definition(
            family=f'collector-{listing_id}',
            taskRoleArn=base_task_def['taskRoleArn'],
            executionRoleArn=base_task_def['executionRoleArn'],
            networkMode=base_task_def['networkMode'],
            containerDefinitions=[container_def],
            requiresCompatibilities=base_task_def['requiresCompatibilities'],
            cpu=base_task_def['cpu'],
            memory=base_task_def['memory']
        )

        collector_task_definition = collector_task_def_response['taskDefinition']['taskDefinitionArn']

        # Check if service already exists
        service_exists = False
        try:
            describe_response = ecs.describe_services(
                cluster=cluster,
                services=[service_name]
            )
            if describe_response['services'] and describe_response['services'][0]['status'] != 'INACTIVE':
                service_exists = True
        except ecs.exceptions.ClientError:
            pass

        if service_exists:
            # Update existing service with new task definition and force new deployment
            response = ecs.update_service(
                cluster=cluster,
                service=service_name,
                taskDefinition=collector_task_definition,
                desiredCount=2,
                forceNewDeployment=True,
                networkConfiguration={
                    'awsvpcConfiguration': {
                        'subnets': subnet_ids,
                        'securityGroups': [security_group_id],
                        'assignPublicIp': 'ENABLED'
                    }
                }
            )
            message = 'Collector service updated and redeployed'
        else:
            # Create new service
            response = ecs.create_service(
                cluster=cluster,
                serviceName=service_name,
                taskDefinition=collector_task_definition,
                desiredCount=2,
                launchType='FARGATE',
                networkConfiguration={
                    'awsvpcConfiguration': {
                        'subnets': subnet_ids,
                        'securityGroups': [security_group_id],
                        'assignPublicIp': 'ENABLED'
                    }
                },
                deploymentConfiguration={
                    'maximumPercent': 200,
                    'minimumHealthyPercent': 50,
                    'deploymentCircuitBreaker': {
                        'enable': True,
                        'rollback': True
                    }
                },
                enableExecuteCommand=True,
                propagateTags='SERVICE',
                tags=[
                    {'key': 'ListingId', 'value': str(listing_id)},
                    {'key': 'DeploymentVersion', 'value': deployment_version}
                ]
            )
            message = 'Collector service created successfully'

        service_arn = response['service']['serviceArn']

        # Store service info in DynamoDB
        db.put_item(listing_id, service_arn, deployment_version)

        return {
            'message': message,
            'serviceArn': service_arn,
            'serviceName': service_name,
            'desiredCount': 2,
            'deploymentVersion': deployment_version,
            'updated': service_exists
        }

    except Exception as e:
        raise Exception(f'Failed to create/update collector service: {str(e)}')