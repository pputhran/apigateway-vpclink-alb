import ecs = require('@aws-cdk/aws-ecs');
import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import cdk = require('@aws-cdk/core');
import { TargetType } from '@aws-cdk/aws-elasticloadbalancingv2';
import { Port, Peer } from '@aws-cdk/aws-ec2';
import apigateway = require('@aws-cdk/aws-apigateway')

const KEY_PAIR_NAME = "<>>" // update this in case you want to ssh

 // update the ALB IPs
 // alternatively, you can use the Lambda function in this blog article
 // to have the NLB aut-register ALB IPs (when it changes)
 // https://aws.amazon.com/blogs/networking-and-content-delivery/using-static-ip-addresses-for-application-load-balancers/
const ALB_IP1= "" 
const ALB_IP2= ""

export class NlbAlbStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // A default VPC configuration will create public and private subnets
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });

    const lbSecurityGroup = new ec2.SecurityGroup(this, 'lbSecurityGroup', {
      vpc,
      securityGroupName: "alb-sg",
      description: 'Allow access only from public subnet',
      allowAllOutbound: true 
    });

    lbSecurityGroup.addIngressRule(Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP')

    const mySecurityGroup = new ec2.SecurityGroup(this, 'ec2SecurityGroup', {
      vpc,
      securityGroupName: "priv-instance-sg",
      description: 'Allow ssh access to ec2 instances from anywhere',
      allowAllOutbound: true
    });

    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow public ssh access')
    mySecurityGroup.connections.allowFrom(lbSecurityGroup, Port.allTraffic())

    const awsAMI = new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 });

    // Instance details
    const ec2Instance = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
      machineImage: awsAMI,
      securityGroup: mySecurityGroup,
      instanceName: "priv-instance",
      keyName: KEY_PAIR_NAME
    });

    ec2Instance.userData.addCommands("sudo yum install -y", 
    "sudo yum install -y httpd",
    "sudo chmod -R 777 /var/www/html",
    "sudo echo hello > /var/www/html/index.html",
    "sudo service httpd start",
    "sudo chkconfig httpd on"
    )
    
    // Create ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      securityGroup:lbSecurityGroup,
      loadBalancerName: "priv-alb"
    });

    const listener = alb.addListener('Listener', {
      port: 80,    
      open: true     
    });    

    const tg = new elbv2.ApplicationTargetGroup(this, "tg", {
      port: 80,
      vpc: vpc,
      targetType:TargetType.INSTANCE,
      targets: [new elbv2.InstanceTarget(ec2Instance.instanceId)]
    })

    listener.addTargetGroups("tg-groups", {
      targetGroups:[tg]
    })

    // create NLB
    const nlb = new elbv2.NetworkLoadBalancer(this, "nlb", {
      vpc,
      crossZoneEnabled: true,
      loadBalancerName: "priv-nlb"
    })

    const nlblist = nlb.addListener("nlb-lis", {
      port:80
    })

    const nlb_tg = new elbv2.NetworkTargetGroup(this, "nlb-tg", {
      port:80,
      vpc: vpc,
      targetType:TargetType.IP,
      targets: [new elbv2.IpTarget(ALB_IP1), new elbv2.IpTarget(ALB_IP2)]
    })

    nlblist.addTargetGroups("nlb-tg", nlb_tg)


    /// creating API Gateway with VPC Link
    const api = new apigateway.RestApi(this, 'vpclink-api', {
      restApiName: "vpclink-api"
    });   
    
      const link = new apigateway.VpcLink(this, 'link', {
      targets: [nlb]
    });


    const integration = new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: "GET",
      options: {
        connectionType: apigateway.ConnectionType.VPC_LINK,
        vpcLink: link
      },
      uri: `http://${nlb.loadBalancerDnsName}`
    });

    api.root.addMethod("GET",integration)

    new cdk.CfnOutput(this, 'APIGAteway', { value: api.url });
  }
}
