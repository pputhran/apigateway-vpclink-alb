#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { NlbAlbStack } from '../lib/nlb-alb-stack';

const app = new cdk.App();
new NlbAlbStack(app, 'APIG-vpc-nlb-alb-test', { 
    env: {
        region: "us-west-2"
    }
});
