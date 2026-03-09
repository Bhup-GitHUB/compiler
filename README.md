# Verilog Compiler TS

Small Verilog compiler prototype written in TypeScript with Bun.

## Install

This project uses Bun.

## Run

```bash
bun run src/main.ts tests/fixtures/test_basic.v
```

## Test

```bash
bun test
```

## Compile To File

```bash
bun run src/main.ts tests/fixtures/test_basic.v -o /tmp/test_basic_netlist.v
```

## Debug Output

```bash
bun run src/main.ts tests/fixtures/test_basic.v --dump-tokens --dump-ast
```
