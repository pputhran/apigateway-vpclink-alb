import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as NlbAlb from '../lib/nlb-alb-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new NlbAlb.NlbAlbStack(app, 'APIG-vpc-nlb-alb');
    // THEN
    // need to update the tests
});
