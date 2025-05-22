/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./jest-setup.js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true,
    }]
  },
  moduleNameMapper: {
    // This helps Jest find the source module when running pre-build tests
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transformIgnorePatterns: ['/node_modules/'],
  testEnvironmentOptions: {
    // Allow top-level await
    customExportConditions: ['node', 'node-addons'],
  }
};
