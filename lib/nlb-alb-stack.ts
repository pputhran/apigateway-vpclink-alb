import ec2 = require('@aws-cdk/aws-ec2');
import elbv2 = require('@aws-cdk/aws-elasticloadbalancingv2');
import cdk = require('@aws-cdk/core');
import { TargetType } from '@aws-cdk/aws-elasticloadbalancingv2';
import { Port, Peer, InterfaceVpcEndpointAwsService, InterfaceVpcEndpoint } from '@aws-cdk/aws-ec2';
import apigateway = require('@aws-cdk/aws-apigateway')
import iam = require('@aws-cdk/aws-iam')
import { ManagedPolicy } from '@aws-cdk/aws-iam';

 // update the ALB IPs
 // alternatively, you can use the Lambda function in this blog article
 // to have the NLB aut-register ALB IPs (when it changes)
 // https://aws.amazon.com/blogs/networking-and-content-delivery/using-static-ip-addresses-for-application-load-balancers/
const ALB_IP1= "10.0.240.165" 
const ALB_IP2= "10.0.176.134"

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

    const ec2SecurityGroup = new ec2.SecurityGroup(this, 'ec2SecurityGroup', {
      vpc,
      securityGroupName: "private-instance-sg",
      description: 'Security Group for the private instance',
      allowAllOutbound: true
    });

    ec2SecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow public ssh access (update this to your IP)')
    ec2SecurityGroup.connections.allowFrom(lbSecurityGroup, Port.allTraffic(),"Allow traffic from ALB")
    ec2SecurityGroup.connections.allowFrom(ec2.Peer.anyIpv4(), Port.tcp(443),"Allow HTTPs traffic")

    const awsAMI = new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 });

    const instanceRole = new iam.Role(this, "instanceRole", {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')    
    }) 

    instanceRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))

    // Instance details
    const ec2Instance = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
      machineImage: awsAMI,
      securityGroup: ec2SecurityGroup,
      instanceName: "private-instance",
      // keyName: KEY_PAIR_NAME,
      role: instanceRole
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
      loadBalancerName: "private-alb"
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
      loadBalancerName: "private-nlb"
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

    const ssm_ep = new InterfaceVpcEndpoint(this, "VPC EP SSM", {
      vpc,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE
      },
      service: InterfaceVpcEndpointAwsService.SSM,
      privateDnsEnabled: true
    })

    vpc.addInterfaceEndpoint("ec2 messages", {
      service: InterfaceVpcEndpointAwsService.EC2_MESSAGES,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE
      }
    })


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

    new cdk.CfnOutput(this, 'APIGateway URL', { value: api.url });
    new cdk.CfnOutput(this, 'ALB DNS', { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'NLB DNS', { value: nlb.loadBalancerDnsName });
  }
}
