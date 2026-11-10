import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: '../server/src/graphql/schema.graphql',
  documents: ['src/**/*.{ts,tsx}', '!src/gql/**', '!src/**/*.test.*'],
  ignoreNoDocuments: true,
  generates: {
    'src/gql/': { preset: 'client', presetConfig: { fragmentMasking: false }, config: { useTypeImports: true } },
  },
}

export default config
