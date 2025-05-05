from db import DynamoDBClient
from utils import lambda_handler

@lambda_handler
def handler(event, context):
    body = event['body']
    listing_id = int(body['listingId'])
    
    db = DynamoDBClient()
    db.delete_item(listing_id)
    
    return {'message': 'Collector deleted successfully'} 