import json
from typing import Any, Callable, Dict

def lambda_handler(func: Callable) -> Callable:
    def wrapper(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
        try:
            result = func(event, context)
            return {
                'statusCode': 200,
                'body': json.dumps(result)
            }
        except Exception as e:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': str(e)})
            }
    return wrapper 