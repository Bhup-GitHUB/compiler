import { readFileSync, writeFileSync } from "node:fs";

import { formatCompilerError } from "./errors";
import { createLexer } from "./lexer";
import { emitVerilog } from "./netlist";
import { createParser } from "./parser";
import { synthesize } from "./synthesizer";

type CliArgs = {
  inputPath: string;
  outputPath: string | null;
  dumpTokens: boolean;
  dumpAst: boolean;
  strict: boolean;
};

function main(): number {
  try {
    const args = parseArgs(process.argv.slice(2));

    console.log("reading file", args.inputPath);
    const source = readFileSync(args.inputPath, "utf-8");

    console.log("starting lexer");
    const tokens = createLexer(source, args.inputPath).tokenize();

    if (args.dumpTokens) {
      for (const token of tokens) {
        console.log(token);
      }
    }

    console.log("starting parser");
    const moduleNode = createParser(tokens).parse();

    if (args.dumpAst) {
      console.log(JSON.stringify(moduleNode, null, 2));
    }

    console.log("starting synthesizer");
    const netlist = synthesize(moduleNode, { strict: args.strict });

    console.log("emitting verilog");
    const output = emitVerilog(netlist);

    if (args.outputPath) {
      console.log("writing output file", args.outputPath);
      writeFileSync(args.outputPath, output, "utf-8");
    } else {
      process.stdout.write(output);
    }

    return 0;
  } catch (error) {
    if (error instanceof Error) {
      if (looksLikeCompilerError(error.message)) {
        console.error(error.message);
        return 1;
      }

      console.error(error.message);
      return 1;
    }

    console.error("unknown compiler error");
    return 1;
  }
}

function parseArgs(args: string[]): CliArgs {
  let inputPath = "";
  let outputPath: string | null = null;
  let dumpTokens = false;
  let dumpAst = false;
  let strict = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dump-tokens") {
      dumpTokens = true;
      continue;
    }

    if (arg === "--dump-ast") {
      dumpAst = true;
      continue;
    }

    if (arg === "--strict") {
      strict = true;
      continue;
    }

    if (arg === "-o" || arg === "--output") {
      const nextValue = args[index + 1];

      if (!nextValue) {
        throw new Error("missing output path after -o/--output");
      }

      outputPath = nextValue;
      index += 1;
      continue;
    }

    if (!inputPath) {
      inputPath = arg;
      continue;
    }

    throw new Error(`unexpected argument '${arg}'`);
  }

  if (!inputPath) {
    throw new Error("missing input file path");
  }

  return {
    inputPath,
    outputPath,
    dumpTokens,
    dumpAst,
    strict,
  };
}

function looksLikeCompilerError(message: string): boolean {
  return /^[^:\n]+:\d+:\d+: /.test(message);
}

process.exit(main());
