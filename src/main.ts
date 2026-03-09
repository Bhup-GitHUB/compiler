import { writeFileSync } from "node:fs";

import { compileFile } from "./compiler";
import { logDebug } from "./debug";

type CliArgs = {
  inputPath: string;
  outputPath: string | null;
  dumpTokens: boolean;
  dumpAst: boolean;
  strict: boolean;
  debug: boolean;
};

function main(): number {
  try {
    const args = parseArgs(process.argv.slice(2));
    console.log(`reading ${args.inputPath}`);
    console.log("running compiler pipeline");
    logDebug(args, "cli", "compile-start", {
      inputPath: args.inputPath,
      outputPath: args.outputPath,
      strict: args.strict,
    });

    const result = compileFile(args.inputPath, {
      strict: args.strict,
      debug: args.debug,
    });

    if (args.dumpTokens) {
      for (const token of result.tokens) {
        console.log(token);
      }
    }

    if (args.dumpAst) {
      console.log(JSON.stringify(result.unit, null, 2));
    }

    if (args.outputPath) {
      console.log(`writing ${args.outputPath}`);
      writeFileSync(args.outputPath, result.output, "utf-8");
      logDebug(args, "cli", "write-output", { outputPath: args.outputPath });
    } else {
      console.log("emitting netlist to stdout");
      process.stdout.write(result.output);
    }

    return 0;
  } catch (error) {
    if (error instanceof Error) {
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
  let debug = false;

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

    if (arg === "--debug") {
      debug = true;
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

  if (dumpTokens || dumpAst) {
    debug = true;
  }

  return {
    inputPath,
    outputPath,
    dumpTokens,
    dumpAst,
    strict,
    debug,
  };
}

process.exit(main());
