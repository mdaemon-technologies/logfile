import typescript from "@rollup/plugin-typescript"
export default [
  {
    input: "src/index.ts",
    external: [ 'fs' ],
    output: [
      { file: "dist/logfile.cjs", format: "cjs", exports: "default" },
      { file: "dist/logfile.mjs", format: "es" }
    ],
    plugins: [
      // tsconfig.build.json excludes the tests, which would otherwise have
      // their declarations emitted into dist and published with the package.
      typescript({ tsconfig: "./tsconfig.build.json" })
    ]
  }
]
