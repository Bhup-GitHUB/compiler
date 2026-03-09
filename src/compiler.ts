import { createSourceManager, type SourceManager } from "./source-manager";
import { createLexer } from "./lexer";
import { emitVerilog, type NetlistModule } from "./netlist";
import { createParser } from "./parser";
import { preprocessSource } from "./preprocessor";
import type { CompilationUnit } from "./ast";
import type { Token } from "./token";
import { synthesizeCompilationUnit } from "./synthesizer";

export type CompileOptions = {
  strict?: boolean;
  debug?: boolean;
};

export type CompileResult = {
  output: string;
  netlists: NetlistModule[];
  tokens: Token[];
  unit: CompilationUnit;
};

export function compileFile(filePath: string, options: CompileOptions = {}): CompileResult {
  const sourceManager = createSourceManager();
  return compileFileWithManager(sourceManager, filePath, options);
}

export function compileFileWithManager(
  sourceManager: SourceManager,
  filePath: string,
  options: CompileOptions = {},
): CompileResult {
  const entrySource = sourceManager.loadFile(filePath);
  const preprocessed = preprocessSource(sourceManager, entrySource);
  const tokens = createLexer(preprocessed, { debug: options.debug }).tokenize();
  const unit = createParser(tokens, { debug: options.debug }).parseCompilationUnit();
  const netlists = synthesizeCompilationUnit(unit, {
    strict: options.strict,
    debug: options.debug,
  });

  return {
    output: netlists.map((netlist) => emitVerilog(netlist)).join(""),
    netlists,
    tokens,
    unit,
  };
}
