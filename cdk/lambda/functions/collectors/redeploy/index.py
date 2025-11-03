import os
import boto3
from db import DynamoDBClient
from utils import lambda_handler
from constants import Status

@lambda_handler
def handler(body):
    """
    Force redeployment of all active collectors to pick up new task definition version.
    This should be called after updating the collectorOrchestratorVersion in config.
    """
    ecs = boto3.client('ecs')
    cluster = os.environ['COLLECTOR_ECS_CLUSTER']
    base_task_definition = os.environ['COLLECTOR_ECS_TASK_DEFINITION']
    deployment_version = os.environ.get('COLLECTOR_DEPLOYMENT_VERSION', 'unknown')
    
    db = DynamoDBClient()
    collectors = db.get_all_items()
    
    # Filter for active collectors only
    active_collectors = [c for c in collectors if c.get('status') == Status.ACTIVE.value]
    
    results = []
    errors = []
    
    for collector in active_collectors:
        listing_id = collector['listingId']
        service_name = f'collector-{listing_id}'
        
        try:
            # Get the base task definition to create a new collector-specific version
            base_task_def_response = ecs.describe_task_definition(taskDefinition=base_task_definition)
            base_task_def = base_task_def_response['taskDefinition']
            
            # Create a new task definition for this specific collector with LISTING_IDS env var
            container_def = base_task_def['containerDefinitions'][0].copy()
            
            # Add LISTING_IDS to environment variables
            if 'environment' not in container_def:
                container_def['environment'] = []
            
            # Remove existing LISTING_IDS if present
            container_def['environment'] = [
                env for env in container_def['environment'] 
                if env['name'] != 'LISTING_IDS'
            ]
            
            # Add the LISTING_IDS for this collector
            container_def['environment'].append({
                'name': 'LISTING_IDS',
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
            
            # Force new deployment with the updated task definition
            response = ecs.update_service(
                cluster=cluster,
                service=service_name,
                taskDefinition=collector_task_definition,
                forceNewDeployment=True
            )
            
            # Update deployment version in DynamoDB
            db.update_service(listing_id, collector['serviceArn'], deployment_version, Status.ACTIVE)
            
            results.append({
                'listingId': listing_id,
                'serviceName': service_name,
                'status': 'redeployed',
                'deploymentVersion': deployment_version
            })
            
        except Exception as e:
            error_msg = f'Failed to redeploy collector {listing_id}: {str(e)}'
            print(error_msg)
            errors.append({
                'listingId': listing_id,
                'error': str(e)
            })
    
    return {
        'message': f'Redeployment initiated for {len(results)} collectors',
        'deploymentVersion': deployment_version,
        'redeployed': results,
        'errors': errors,
        'totalActive': len(active_collectors),
        'successCount': len(results),
        'errorCount': len(errors)
    }

