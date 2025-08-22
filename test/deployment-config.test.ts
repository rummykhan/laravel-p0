import { getDeploymentConfig, validateDeploymentConfig } from '../config/deployment-config';

describe('Deployment Configuration', () => {
  test('should return beta configuration for beta stage', () => {
    const config = getDeploymentConfig('beta');
    expect(config.ecsConfig.cpu).toBe(512);
    expect(config.ecsConfig.memoryLimitMiB).toBe(1024);
    expect(config.ecsConfig.desiredCount).toBe(2);
    expect(config.ecsConfig.environmentVariables.NODE_ENV).toBe('development');
    expect(config.enableDetailedMonitoring).toBe(true);
  });

  test('should return production configuration for prod stage', () => {
    const config = getDeploymentConfig('prod');
    expect(config.ecsConfig.cpu).toBe(1024);
    expect(config.ecsConfig.memoryLimitMiB).toBe(2048);
    expect(config.ecsConfig.desiredCount).toBe(3);
    expect(config.ecsConfig.minCapacity).toBe(2);
    expect(config.ecsConfig.environmentVariables.NODE_ENV).toBe('production');
    expect(config.enableDetailedMonitoring).toBe(true);
  });

  test('should return gamma configuration for gamma stage', () => {
    const config = getDeploymentConfig('gamma');
    expect(config.ecsConfig.cpu).toBe(1024);
    expect(config.ecsConfig.memoryLimitMiB).toBe(1536);
    expect(config.ecsConfig.desiredCount).toBe(2);
    expect(config.ecsConfig.environmentVariables.NODE_ENV).toBe('staging');
    expect(config.enableXRayTracing).toBe(true);
  });

  test('should fallback to beta configuration for unknown stage', () => {
    const config = getDeploymentConfig('unknown');
    expect(config.ecsConfig.cpu).toBe(512);
    expect(config.ecsConfig.memoryLimitMiB).toBe(1024);
    expect(config.ecsConfig.environmentVariables.NODE_ENV).toBe('development');
  });

  test('should validate valid deployment configuration', () => {
    const config = getDeploymentConfig('beta');
    expect(() => validateDeploymentConfig(config)).not.toThrow();
  });

  test('should throw error for invalid CPU/Memory combination', () => {
    const config = getDeploymentConfig('beta');
    config.ecsConfig.cpu = 256;
    config.ecsConfig.memoryLimitMiB = 4096; // Invalid combination
    expect(() => validateDeploymentConfig(config)).toThrow();
  });

  test('should throw error when minCapacity > maxCapacity', () => {
    const config = getDeploymentConfig('beta');
    config.ecsConfig.minCapacity = 10;
    config.ecsConfig.maxCapacity = 5;
    expect(() => validateDeploymentConfig(config)).toThrow();
  });

  test('should throw error when desiredCount is outside capacity range', () => {
    const config = getDeploymentConfig('beta');
    config.ecsConfig.desiredCount = 15;
    config.ecsConfig.maxCapacity = 10;
    expect(() => validateDeploymentConfig(config)).toThrow();
  });
});