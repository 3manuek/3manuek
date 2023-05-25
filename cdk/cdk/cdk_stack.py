from aws_cdk import (
    # Duration,
    Stack,
    CfnOutput,
    aws_s3 as s3
    # aws_sqs as sqs,
)
from constructs import Construct

class CdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        bucket = s3.Bucket(self, "tresmabucket", bucket_name="tresmacdkbucket", public_read_access=True, website_index_document="index.html")
        CfnOutput(self, "sitetresmabucketname", value=bucket.bucket_name)
        CfnOutput(self, "sitetresmaBucketWebsite", value=bucket.bucket_website_url)