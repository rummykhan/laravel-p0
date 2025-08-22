/**
 * Unit tests for ConfigurationResolver
 * 
 * These tests verify the configuration resolution, validation, and error handling
 * functionality of the ConfigurationResolver class.
 */

import { ConfigurationResolver } from '../configuration-resolver';
import {
  ApplicationConfig,
  EnvironmentConfig,
  ResolvedApplicationConfig,
  ValidationErrorType
} from '../configuration-types';

describe('ConfigurationResolver', () => {
  let resolver: ConfigurationResolver;
  let mockDefaultConfig: ApplicationConfig;
  let mockEnvironmentConfigs: EnvironmentConfig[];

  beforeEach(() => {
    // Mock default configuration
    mockDefaultConfig = {
      applicationName: 'test-app',
      applicationDisplayName: 'Test Application',
      sourceDirectory: 'test-app',
      ecrRepositoryName: 'test-app',
      dockerfilePath: 'Dockerfile',
      containerPort: 3000,
      healthCheckPath: '/health',
      serviceName: 'test-app-service',
      clusterNameSuffix: 'cluster',
      taskDefinitionFamily: 'test-app',
      albName: 'test-app-alb',
      targetGroupName: 'test-app-tg',
      buildCommands: ['npm ci', 'npm run build'],
      dockerBuildArgs: { NODE_ENV: 'production' }
    };

    // Mock environment configurations
    mockEnvironmentConfigs = [
      {
        stage: 'beta',
        namingConvention: {
          useStagePrefix: false,
          useStageSuffix: true,
          separator: '-'
        },
        applicationOverrides: {
          containerPort: 3001
        },
        buildOverrides: {
          dockerBuildArgs: {
            NODE_ENV: 'staging',
            DEBUG: 'true'
          }
        }
      },
      {
        stage: 'prod',
        namingConvention: {
          useStagePrefix: false,
          useStageSuffix: true,
          separator: '-'
        },
        buildOverrides: {
          buildCommands: ['npm ci --only=production', 'npm run build']
        }
      }
    ];

    resolver = new ConfigurationResolver(mockDefaultConfig, mockEnvironmentConfigs);
  });

  describe('constructor', () => {
    it('should initialize with default configurations when no parameters provided', () => {
      const defaultResolver = new ConfigurationResolver();
      expect(defaultResolver.getAvailableStages()).toContain('beta');
      expect(defaultResolver.getAvailableStages()).toContain('prod');
    });

    it('should initialize with provided configurations', () => {
      expect(resolver.getAvailableStages()).toEqual(['beta', 'prod']);
      expect(resolver.isValidStage('beta')).toBe(true);
      expect(resolver.isValidStage('gamma')).toBe(false);
    });
  });

  describe('resolveConfiguration', () => {
    it('should resolve configuration for valid stage with environment overrides', () => {
      const resolved = resolver.resolveConfiguration('beta');

      expect(resolved.resolvedStage).toBe('beta');
      expect(resolved.containerPort).toBe(3001); // Override from environment
      expect(resolved.applicationName).toBe('test-app'); // From default
      expect(resolved.dockerBuildArgs).toEqual({
        NODE_ENV: 'staging', // Override from environment
        DEBUG: 'true' // Added from environment
      });
    });

    it('should resolve configuration for stage without overrides', () => {
      const resolved = resolver.resolveConfiguration('prod');

      expect(resolved.resolvedStage).toBe('prod');
      expect(resolved.containerPort).toBe(3000); // From default
      expect(resolved.buildCommands).toEqual(['npm ci --only=production', 'npm run build']); // Override from environment
    });

    it('should resolve configuration for unknown stage with warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const resolved = resolver.resolveConfiguration('unknown');

      expect(resolved.resolvedStage).toBe('unknown');
      expect(resolved.containerPort).toBe(3000); // From default
      expect(consoleSpy).toHaveBeenCalledWith(
        "Warning: No environment configuration found for stage 'unknown'. Using default configuration."
      );

      consoleSpy.mockRestore();
    });

    it('should generate correct resource names with naming convention', () => {
      const resolved = resolver.resolveConfiguration('beta');

      expect(resolved.resourceNames.ecrRepositoryName).toBe('test-app-beta');
      expect(resolved.resourceNames.clusterName).toBe('test-app-cluster-beta');
      expect(resolved.resourceNames.serviceName).toBe('test-app-service-beta');
      expect(resolved.resourceNames.logGroupName).toBe('/aws/ecs/test-app-beta');
    });

    it('should throw error for invalid stage parameter', () => {
      expect(() => resolver.resolveConfiguration('')).toThrow('Stage must be a non-empty string');
      expect(() => resolver.resolveConfiguration(null as any)).toThrow('Stage must be a non-empty string');
    });

    it('should throw error for invalid configuration', () => {
      const invalidConfig = { ...mockDefaultConfig, containerPort: -1 };
      const invalidResolver = new ConfigurationResolver(invalidConfig, mockEnvironmentConfigs);

      expect(() => invalidResolver.resolveConfiguration('prod')).toThrow('Configuration validation failed');
    });
  });

  describe('validateConfiguration', () => {
    let validConfig: ResolvedApplicationConfig;

    beforeEach(() => {
      validConfig = resolver.resolveConfiguration('beta');
    });

    it('should validate valid configuration successfully', () => {
      const result = resolver.validateConfiguration(validConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidConfig = { ...validConfig, applicationName: '' };
      const result = resolver.validateConfiguration(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Required field 'applicationName' is missing or empty");
    });

    it('should detect invalid port numbers', () => {
      const invalidConfig = { ...validConfig, containerPort: -1 };
      const result = resolver.validateConfiguration(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Container port must be an integer between 1 and 65535, got: -1');
    });

    it('should detect invalid health check paths', () => {
      const invalidConfig = { ...validConfig, healthCheckPath: 'invalid-path' };
      const result = resolver.validateConfiguration(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Health check path must start with '/', got: invalid-path");
    });

    it('should detect invalid AWS resource names', () => {
      const invalidConfig = { ...validConfig, serviceName: '-invalid-name-' };
      const result = resolver.validateConfiguration(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('invalid characters for AWS resources'))).toBe(true);
    });

    it('should detect docker build arg type errors', () => {
      const invalidConfig = { ...validConfig, dockerBuildArgs: { NODE_ENV: 123 as any } };
      const result = resolver.validateConfiguration(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Docker build arg 'NODE_ENV' must be a string, got: number");
    });

    it('should warn about missing build commands', () => {
      const configWithoutBuildCommands = { ...validConfig, buildCommands: [] };
      const result = resolver.validateConfiguration(configWithoutBuildCommands);

      expect(result.warnings).toContain('No build commands specified, build may fail');
    });

    it('should warn about dockerfile path security issues', () => {
      const configWithUnsafePath = { ...validConfig, dockerfilePath: '../Dockerfile' };
      const result = resolver.validateConfiguration(configWithUnsafePath);

      expect(result.warnings).toContain("Dockerfile path contains '..' which may cause security issues: ../Dockerfile");
    });
  });

  describe('validateConfigurationDetailed', () => {
    let validConfig: ResolvedApplicationConfig;

    beforeEach(() => {
      validConfig = resolver.resolveConfiguration('beta');
    });

    it('should provide detailed validation results for valid configuration', () => {
      const result = resolver.validateConfigurationDetailed(validConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toContain('Configuration validation passed');
    });

    it('should provide detailed error information for missing fields', () => {
      const invalidConfig = { ...validConfig, applicationName: '' };
      const result = resolver.validateConfigurationDetailed(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe(ValidationErrorType.MISSING_REQUIRED_FIELD);
      expect(result.errors[0].field).toBe('applicationName');
      expect(result.errors[0].suggestion).toContain('Provide a non-empty value');
    });

    it('should provide detailed error information for invalid ports', () => {
      const invalidConfig = { ...validConfig, containerPort: 70000 };
      const result = resolver.validateConfigurationDetailed(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].type).toBe(ValidationErrorType.INVALID_PORT);
      expect(result.errors[0].field).toBe('containerPort');
      expect(result.errors[0].suggestion).toContain('Use a valid port number');
    });

    it('should provide detailed error information for AWS naming violations', () => {
      const invalidConfig = { ...validConfig, serviceName: '-invalid-' };
      const result = resolver.validateConfigurationDetailed(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].type).toBe(ValidationErrorType.AWS_NAMING_VIOLATION);
      expect(result.errors[0].suggestion).toContain('alphanumeric characters and hyphens');
    });

    it('should provide summary with error count', () => {
      const invalidConfig = { 
        ...validConfig, 
        applicationName: '', 
        containerPort: -1 
      };
      const result = resolver.validateConfigurationDetailed(invalidConfig);

      expect(result.summary).toContain('failed with 2 error(s)');
    });
  });

  describe('resource name generation', () => {
    it('should generate names with stage suffix by default', () => {
      const resolved = resolver.resolveConfiguration('beta');

      expect(resolved.resourceNames.ecrRepositoryName).toBe('test-app-beta');
      expect(resolved.resourceNames.serviceName).toBe('test-app-service-beta');
      expect(resolved.resourceNames.albName).toBe('test-app-alb-beta');
    });

    it('should generate names with stage prefix when configured', () => {
      const prefixConfig: EnvironmentConfig = {
        stage: 'test',
        namingConvention: {
          useStagePrefix: true,
          useStageSuffix: false,
          separator: '_'
        }
      };

      const prefixResolver = new ConfigurationResolver(mockDefaultConfig, [prefixConfig]);
      const resolved = prefixResolver.resolveConfiguration('test');

      expect(resolved.resourceNames.ecrRepositoryName).toBe('test_test-app');
      expect(resolved.resourceNames.serviceName).toBe('test_test-app-service');
    });

    it('should generate names with both prefix and suffix when configured', () => {
      const bothConfig: EnvironmentConfig = {
        stage: 'test',
        namingConvention: {
          useStagePrefix: true,
          useStageSuffix: true,
          separator: '.'
        }
      };

      const bothResolver = new ConfigurationResolver(mockDefaultConfig, [bothConfig]);
      const resolved = bothResolver.resolveConfiguration('test');

      expect(resolved.resourceNames.ecrRepositoryName).toBe('test.test-app.test');
      expect(resolved.resourceNames.serviceName).toBe('test.test-app-service.test');
    });

    it('should generate security group names correctly', () => {
      const resolved = resolver.resolveConfiguration('beta');

      expect(resolved.resourceNames.albSecurityGroupName).toBe('test-app-alb-sg-beta');
      expect(resolved.resourceNames.ecsSecurityGroupName).toBe('test-app-ecs-sg-beta');
    });

    it('should generate log group names correctly', () => {
      const resolved = resolver.resolveConfiguration('beta');

      expect(resolved.resourceNames.logGroupName).toBe('/aws/ecs/test-app-beta');
    });
  });

  describe('utility methods', () => {
    it('should return available stages', () => {
      const stages = resolver.getAvailableStages();
      expect(stages).toEqual(['beta', 'prod']);
    });

    it('should validate stage existence', () => {
      expect(resolver.isValidStage('beta')).toBe(true);
      expect(resolver.isValidStage('prod')).toBe(true);
      expect(resolver.isValidStage('gamma')).toBe(false);
      expect(resolver.isValidStage('')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle configuration with all required fields missing', () => {
      const emptyConfig = {} as ApplicationConfig;
      const emptyResolver = new ConfigurationResolver(emptyConfig, []);

      expect(() => emptyResolver.resolveConfiguration('test')).toThrow('Configuration validation failed');
    });

    it('should handle environment config with invalid overrides', () => {
      const invalidEnvConfig: EnvironmentConfig = {
        stage: 'invalid',
        namingConvention: {
          useStagePrefix: false,
          useStageSuffix: true,
          separator: '-'
        },
        applicationOverrides: {
          containerPort: -999
        }
      };

      const invalidResolver = new ConfigurationResolver(mockDefaultConfig, [invalidEnvConfig]);
      expect(() => invalidResolver.resolveConfiguration('invalid')).toThrow('Configuration validation failed');
    });
  });

  describe('build configuration merging', () => {
    it('should merge docker build args correctly', () => {
      const resolved = resolver.resolveConfiguration('beta');

      expect(resolved.dockerBuildArgs).toEqual({
        NODE_ENV: 'staging', // Overridden
        DEBUG: 'true' // Added
      });
    });

    it('should replace build commands when overridden', () => {
      const resolved = resolver.resolveConfiguration('prod');

      expect(resolved.buildCommands).toEqual(['npm ci --only=production', 'npm run build']);
    });

    it('should preserve default build commands when not overridden', () => {
      const resolved = resolver.resolveConfiguration('beta');

      expect(resolved.buildCommands).toEqual(['npm ci', 'npm run build']);
    });
  });
});