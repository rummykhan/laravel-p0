
```sh
➜  laravel-p0 git:(main) ✗ cdk bootstrap aws://108271872087/us-east-1 \
  --trust 108271872087 \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
  --qualifier meta-capi


 ⏳  Bootstrapping environment aws://108271872087/us-east-1...
Trusted accounts for deployment: 108271872087
Trusted accounts for lookup: (none)
Execution policies: arn:aws:iam::aws:policy/AdministratorAccess
CDKToolkit: creating CloudFormation changeset...
 ✅  Environment aws://108271872087/us-east-1 bootstrapped.


➜  laravel-p0 git:(main) ✗ 

```