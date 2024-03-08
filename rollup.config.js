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
      typescript()
    ]
  }
]
