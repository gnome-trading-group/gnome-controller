import boto3
import os
from typing import Dict, List, Optional
import time

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

    def put_item(self, listing_id: int) -> Dict:
        return self.table.put_item(
            Item={
                'listingId': listing_id,
                'lastHeartbeat': None,
            }
        )

    def delete_item(self, listing_id: int) -> Dict:
        return self.table.delete_item(Key={'listingId': listing_id})

    def update_heartbeat(self, listing_id: int) -> Dict:
        return self.table.update_item(
            Key={'listingId': listing_id},
            UpdateExpression='SET lastHeartbeat = :now',
            ExpressionAttributeValues={':now': int(time.time())}
        ) 