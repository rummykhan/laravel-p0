module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/config'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'config/**/*.ts',
    '!config/**/*.d.ts',
    '!config/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};