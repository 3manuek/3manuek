# CDK

- [Setup](https://kevanpeters.com/post/cdktut/)
- [API reerence for CDK Python](https://docs.aws.amazon.com/cdk/api/v2/python/index.html)
  - [Bucket](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_s3/Bucket.html)
- [Migrating from CDK v1 to v2](https://docs.aws.amazon.com/cdk/v2/guide/migrating-v2.html#migrating-v2-v1-uppgrade)

For the aws configuration, use profiles in the `.aws/config` file as follows:

```conf
[profile tresma]
region=us-east-1
output=json
aws_access_key_id = <key_id>
aws_secret_access_key = <secret>
```

## Initialization (one time)

```bash
cdk --profile=tresma init app --language python
source .venv/bin/activate
pip install -r requirements.txt
export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION # just for ignoring node version compatibility, if you are sure what you're doing
```

Bootstrap:

```bash
cdk --profile=tresma bootstrap -b cdktresmasite
cdk bootstrap --profile=tresma
cdk bootstrap --profile=tresma aws://984907411244/us-east-1    

# took the output of the deploy and hardcoded here
cdk bootstrap --profile=tresma -b cdk-hnb659fds-assets-984907411244-us-east-1         
```

> Couldn't find the way to make de cdk to take the custom bucket.

```bash
cdk ls
cdk diff
cdk --profile=tresma deploy
```

- Build the site by `hugo` in the root folder.

```bash
aws --profile=tresma s3 sync ../../public s3://<bucketname> --acl public-read
```