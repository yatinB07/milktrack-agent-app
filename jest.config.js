module.exports = { preset: 'jest-expo', setupFiles: ['<rootDir>/test/jest.setup.js'], testMatch: ['**/__tests__/**/*.test.ts?(x)'], moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' } };
