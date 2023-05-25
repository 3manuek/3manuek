# WTFs

[Stack Overflow](https://stackoverflow.com/a/70061967/3264121)

```bash
cdk bootstrap --profile=tresma --trust=984907411244 --cloudformation-execution-policies=arn:aws:iam::aws:policy/AdministratorAccess -b cdk-hnb659fds-assets-984907411244-us-east-1  --force --verbose

cdk bootstrap --profile=tresma --no-previous-parameters --trust=984907411244 -b cdk-hnb659fds-assets-984907411244-us-east-1
```