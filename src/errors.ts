import type { SourceLocation, SourceSpan } from "./ast";

export const CompilerErrorType = {
  COMPILER: "COMPILER",
  LEXER: "LEXER",
  PARSER: "PARSER",
  SYNTHESIS: "SYNTHESIS",
  PREPROCESSOR: "PREPROCESSOR",
} as const;

export type CompilerErrorType =
  (typeof CompilerErrorType)[keyof typeof CompilerErrorType];

export type CompilerError = {
  type: CompilerErrorType;
  message: string;
  fileName: string;
  line: number;
  column: number;
  notes: string[];
};

export function createCompilerError(
  type: CompilerErrorType,
  message: string,
  fileName: string,
  line: number,
  column: number,
  notes: string[] = [],
): CompilerError {
  return {
    type,
    message,
    fileName,
    line,
    column,
    notes,
  };
}

export function createLexerError(
  message: string,
  fileName: string,
  line: number,
  column: number,
  notes: string[] = [],
): CompilerError {
  return createCompilerError(CompilerErrorType.LEXER, message, fileName, line, column, notes);
}

export function createParserError(
  message: string,
  fileName: string,
  line: number,
  column: number,
  notes: string[] = [],
): CompilerError {
  return createCompilerError(CompilerErrorType.PARSER, message, fileName, line, column, notes);
}

export function createSynthesisError(
  message: string,
  fileName: string,
  line: number,
  column: number,
  notes: string[] = [],
): CompilerError {
  return createCompilerError(CompilerErrorType.SYNTHESIS, message, fileName, line, column, notes);
}

export function createPreprocessorError(
  message: string,
  fileName: string,
  line: number,
  column: number,
  notes: string[] = [],
): CompilerError {
  return createCompilerError(
    CompilerErrorType.PREPROCESSOR,
    message,
    fileName,
    line,
    column,
    notes,
  );
}

export function locationToErrorArgs(location: SourceLocation): [string, number, number] {
  return [location.fileName, location.line, location.column];
}

export function spanStart(span: SourceSpan): SourceLocation {
  return span.start;
}

export function formatCompilerError(error: CompilerError): string {
  const header = `${error.fileName}:${error.line}:${error.column}: ${error.message}`;

  if (error.notes.length === 0) {
    return header;
  }

  return `${header}\n${error.notes.join("\n")}`;
}
