import boto3
import os
from typing import Dict, List, Optional
import time
from constants import Status

class DynamoDBClient:
    def __init__(self):
        self.table_name = os.environ['COLLECTORS_TABLE_NAME']
        self.dynamodb = boto3.resource('dynamodb')
        self.table = self.dynamodb.Table(self.table_name)

    def get_all_items(self) -> List[Dict]:
        response = self.table.scan()
        return response.get('Items', [])

    def get_item(self, listing_id: int) -> Optional[Dict]:
        response = self.table.get_item(Key={'listingId': listing_id})
        return response.get('Item')

    def put_item(self, listing_id: int, taskArn: str) -> Dict:
        existing_item = self.get_item(listing_id)
        
        if existing_item:
            return self.update_status(listing_id, Status.PENDING, None, taskArn)
        else:
            return self.table.put_item(
                Item={
                    'listingId': listing_id,
                    'status': Status.PENDING,
                    'taskArn': taskArn,
                    'lastHeartbeat': None,
                    'lastStatusChange': int(time.time()),
                    'failureReason': None,
                }
            )
    
    def update_status(self, listing_id: int, status: Status, failureReason: Optional[str] = None, taskArn: Optional[str] = None) -> Dict:
        update_expr = 'SET #s = :status, lastStatusChange = :now, failureReason = :reason'
        expr_values = {
            ':status': status.value,
            ':now': int(time.time()),
            ':reason': failureReason
        }
        expr_names = {
            '#s': 'status'
        }
        
        if taskArn:
            update_expr += ', taskArn = :taskArn'
            expr_values[':taskArn'] = taskArn
            
        return self.table.update_item(
            Key={'listingId': listing_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names
        )

    def update_heartbeat(self, listing_id: int) -> Dict:
        return self.table.update_item(
            Key={'listingId': listing_id},
            UpdateExpression='SET lastHeartbeat = :now',
            ExpressionAttributeValues={':now': int(time.time())}
        ) 