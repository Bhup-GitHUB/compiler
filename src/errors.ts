export const CompilerErrorType = {
  COMPILER: "COMPILER",
  LEXER: "LEXER",
  PARSER: "PARSER",
  SYNTHESIS: "SYNTHESIS",
} as const;

export type CompilerErrorType =
  (typeof CompilerErrorType)[keyof typeof CompilerErrorType];

export type CompilerError = {
  type: CompilerErrorType;
  message: string;
  fileName: string;
  line: number;
  column: number;
};

export function createCompilerError(
  type: CompilerErrorType,
  message: string,
  fileName: string,
  line: number,
  column: number,
): CompilerError {
  return {
    type,
    message,
    fileName,
    line,
    column,
  };
}

export function createLexerError(
  message: string,
  fileName: string,
  line: number,
  column: number,
): CompilerError {
  return createCompilerError(CompilerErrorType.LEXER, message, fileName, line, column);
}

export function createParserError(
  message: string,
  fileName: string,
  line: number,
  column: number,
): CompilerError {
  return createCompilerError(CompilerErrorType.PARSER, message, fileName, line, column);
}

export function createSynthesisError(
  message: string,
  fileName: string,
  line: number,
  column: number,
): CompilerError {
  return createCompilerError(CompilerErrorType.SYNTHESIS, message, fileName, line, column);
}

export function formatCompilerError(error: CompilerError): string {
  return `${error.fileName}:${error.line}:${error.column}: ${error.message}`;
}
