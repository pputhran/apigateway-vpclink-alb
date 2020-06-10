# API Gateway -> VPC Link (NLB) --> ALB --> EC2/ECS

This is the same setup for setup for APIGateway with VPCLink(NLB) to ALB into EC2

Please update the following in the `nlb-alb-stack.ts` under `lib`

```
const KEY_PAIR_NAME = "<>>" // update this in case you want to ssh

 // update the ALB IPs
 // alternatively, you can use the Lambda function in this blog article
 // to have the NLB aut-register ALB IPs (when it changes)
 // https://aws.amazon.com/blogs/networking-and-content-delivery/using-static-ip-addresses-for-application-load-balancers/
const ALB_IP1= "" 
const ALB_IP2= ""

```

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
