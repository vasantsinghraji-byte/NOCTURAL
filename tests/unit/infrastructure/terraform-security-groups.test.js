const fs = require('fs');
const path = require('path');

const securityTf = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', 'terraform', 'security.tf'),
  'utf8'
);

describe('Terraform security groups', () => {
  it('declares the security groups referenced by the main Terraform stack', () => {
    expect(securityTf).toMatch(/resource\s+"aws_security_group"\s+"alb"/);
    expect(securityTf).toMatch(/resource\s+"aws_security_group"\s+"app"/);
    expect(securityTf).toMatch(/resource\s+"aws_security_group"\s+"database"/);
    expect(securityTf).toMatch(/resource\s+"aws_security_group"\s+"redis"/);
  });

  it('allows public HTTP and HTTPS only on the ALB security group', () => {
    expect(securityTf).toMatch(/from_port\s+=\s+80[\s\S]*?to_port\s+=\s+80[\s\S]*?cidr_blocks\s+=\s+\["0\.0\.0\.0\/0"\]/);
    expect(securityTf).toMatch(/from_port\s+=\s+443[\s\S]*?to_port\s+=\s+443[\s\S]*?cidr_blocks\s+=\s+\["0\.0\.0\.0\/0"\]/);
  });

  it('restricts application, database, and Redis ingress to upstream security groups', () => {
    expect(securityTf).toMatch(/from_port\s+=\s+var\.app_port[\s\S]*?security_groups\s+=\s+\[aws_security_group\.alb\.id\]/);
    expect(securityTf).toMatch(/from_port\s+=\s+27017[\s\S]*?security_groups\s+=\s+\[aws_security_group\.app\.id\]/);
    expect(securityTf).toMatch(/from_port\s+=\s+6379[\s\S]*?security_groups\s+=\s+\[aws_security_group\.app\.id\]/);
  });
});
