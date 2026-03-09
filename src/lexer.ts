import type { SourceLocation, SourceSpan } from "./ast";
import { logDebug } from "./debug";
import { createLexerError, formatCompilerError } from "./errors";
import type { PreprocessedSource } from "./preprocessor";
import type { Token } from "./token";
import { TokenType } from "./token-types";

type CreateLexerOptions = {
  debug?: boolean;
};

type Lexer = {
  source: string;
  fileName: string;
  position: number;
  debug: boolean;
  getLocation: (offset: number) => SourceLocation;
  tokenize: () => Token[];
};

const KEYWORD_TOKEN_MAP: Record<string, Token[keyof Pick<Token, "type">]> = {
  module: TokenType.MODULE,
  endmodule: TokenType.ENDMODULE,
  input: TokenType.INPUT,
  output: TokenType.OUTPUT,
  wire: TokenType.WIRE,
  assign: TokenType.ASSIGN,
  and: TokenType.KW_AND,
  or: TokenType.KW_OR,
  not: TokenType.KW_NOT,
  xor: TokenType.KW_XOR,
  nand: TokenType.KW_NAND,
  nor: TokenType.KW_NOR,
};

const BASED_NUMBER_REST = /^[bBdDhH][0-9a-fA-FxXzZ_]+/;
const INVALID_MIXED_NUMBER = /^\d+[A-Za-z_][A-Za-z0-9_]*/;

export function createLexer(
  input: string | PreprocessedSource,
  fileNameOrOptions: string | CreateLexerOptions = "<memory>",
  maybeOptions: CreateLexerOptions = {},
): Lexer {
  const source = typeof input === "string" ? input : input.text;
  const options =
    typeof fileNameOrOptions === "string" ? maybeOptions : fileNameOrOptions;
  const fileName = typeof fileNameOrOptions === "string"
    ? fileNameOrOptions
    : input.fileName;
  const getLocation = typeof input === "string"
    ? createPlainLocationResolver(source, fileName)
    : input.getLocation;

  const lexer: Lexer = {
    source,
    fileName,
    position: 0,
    debug: options.debug === true,
    getLocation,
    tokenize: () => tokenize(lexer),
  };

  return lexer;
}

function tokenize(lexer: Lexer): Token[] {
  const tokens: Token[] = [];

  while (lexer.position < lexer.source.length) {
    skipWhitespace(lexer);
    skipComments(lexer);
    skipWhitespace(lexer);

    if (lexer.position >= lexer.source.length) {
      break;
    }

    const token = readNextToken(lexer);
    tokens.push(token);
    logDebug(lexer, "lexer", "token", {
      type: token.type,
      value: token.value,
      fileName: token.fileName,
      line: token.line,
      column: token.column,
    });
  }

  const eofToken = createToken(lexer, TokenType.EOF, "", lexer.position, lexer.position);
  tokens.push(eofToken);
  logDebug(lexer, "lexer", "token", {
    type: eofToken.type,
    fileName: eofToken.fileName,
    line: eofToken.line,
    column: eofToken.column,
  });
  return tokens;
}

function readNextToken(lexer: Lexer): Token {
  const char = currentChar(lexer);

  if (char === "(") {
    return readSingleCharToken(lexer, TokenType.LPAREN);
  }

  if (char === ")") {
    return readSingleCharToken(lexer, TokenType.RPAREN);
  }

  if (char === ";") {
    return readSingleCharToken(lexer, TokenType.SEMICOLON);
  }

  if (char === ",") {
    return readSingleCharToken(lexer, TokenType.COMMA);
  }

  if (char === "=") {
    return readSingleCharToken(lexer, TokenType.EQUALS);
  }

  if (char === "&" && peek(lexer) === "&") {
    return readDoubleCharToken(lexer, TokenType.LOGICAL_AND);
  }

  if (char === "|" && peek(lexer) === "|") {
    return readDoubleCharToken(lexer, TokenType.LOGICAL_OR);
  }

  if (char === "&") {
    return readSingleCharToken(lexer, TokenType.BIT_AND);
  }

  if (char === "|") {
    return readSingleCharToken(lexer, TokenType.BIT_OR);
  }

  if (char === "^") {
    return readSingleCharToken(lexer, TokenType.BIT_XOR);
  }

  if (char === "~") {
    return readSingleCharToken(lexer, TokenType.BIT_NOT);
  }

  if (isDigit(char)) {
    return readNumber(lexer);
  }

  if (isIdentifierStart(char)) {
    return readIdentifierOrKeyword(lexer);
  }

  raiseLexerError(lexer, `invalid character '${char}'`);
}

function skipWhitespace(lexer: Lexer): void {
  while (lexer.position < lexer.source.length) {
    const char = currentChar(lexer);

    if (!isWhitespace(char)) {
      return;
    }

    lexer.position += 1;
  }
}

function skipComments(lexer: Lexer): void {
  while (true) {
    if (currentChar(lexer) === "/" && peek(lexer) === "/") {
      skipLineComment(lexer);
      continue;
    }

    if (currentChar(lexer) === "/" && peek(lexer) === "*") {
      skipBlockComment(lexer);
      continue;
    }

    return;
  }
}

function skipLineComment(lexer: Lexer): void {
  while (lexer.position < lexer.source.length) {
    const char = currentChar(lexer);
    lexer.position += 1;

    if (char === "\n") {
      return;
    }
  }
}

function skipBlockComment(lexer: Lexer): void {
  const start = lexer.position;
  lexer.position += 2;

  while (lexer.position < lexer.source.length) {
    if (currentChar(lexer) === "*" && peek(lexer) === "/") {
      lexer.position += 2;
      return;
    }

    lexer.position += 1;
  }

  const location = lexer.getLocation(start);
  const error = createLexerError(
    "unterminated block comment",
    location.fileName,
    location.line,
    location.column,
  );
  throw new Error(formatCompilerError(error));
}

function readIdentifierOrKeyword(lexer: Lexer): Token {
  const start = lexer.position;

  while (lexer.position < lexer.source.length && isIdentifierPart(currentChar(lexer))) {
    lexer.position += 1;
  }

  const value = lexer.source.slice(start, lexer.position);
  const tokenType = KEYWORD_TOKEN_MAP[value] ?? TokenType.IDENTIFIER;
  return createToken(lexer, tokenType, value, start, lexer.position);
}

function readNumber(lexer: Lexer): Token {
  const start = lexer.position;
  const remaining = lexer.source.slice(lexer.position);
  const invalidMixed = remaining.match(INVALID_MIXED_NUMBER);

  if (invalidMixed) {
    raiseLexerError(lexer, `invalid number literal '${invalidMixed[0]}'`);
  }

  while (lexer.position < lexer.source.length && isDigit(currentChar(lexer))) {
    lexer.position += 1;
  }

  if (currentChar(lexer) === "'") {
    const rest = lexer.source.slice(lexer.position + 1);
    const basedNumber = rest.match(BASED_NUMBER_REST);

    if (!basedNumber) {
      raiseLexerError(lexer, `invalid number literal '${lexer.source.slice(start, lexer.position)}'`);
    }

    lexer.position += 1 + basedNumber[0].length;
  }

  return createToken(lexer, TokenType.NUMBER, lexer.source.slice(start, lexer.position), start, lexer.position);
}

function readSingleCharToken(lexer: Lexer, type: Token["type"]): Token {
  const start = lexer.position;
  lexer.position += 1;
  return createToken(lexer, type, lexer.source.slice(start, lexer.position), start, lexer.position);
}

function readDoubleCharToken(lexer: Lexer, type: Token["type"]): Token {
  const start = lexer.position;
  lexer.position += 2;
  return createToken(lexer, type, lexer.source.slice(start, lexer.position), start, lexer.position);
}

function createToken(
  lexer: Lexer,
  type: Token["type"],
  value: string,
  startOffset: number,
  endOffset: number,
): Token {
  const start = lexer.getLocation(startOffset);
  const end = lexer.getLocation(Math.max(startOffset, endOffset - 1));
  const span: SourceSpan = {
    start,
    end,
  };

  return {
    type,
    value,
    line: start.line,
    column: start.column,
    fileName: start.fileName,
    span,
  };
}

function currentChar(lexer: Lexer): string {
  return lexer.source[lexer.position] ?? "";
}

function peek(lexer: Lexer): string {
  return lexer.source[lexer.position + 1] ?? "";
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char);
}

function raiseLexerError(lexer: Lexer, message: string): never {
  const location = lexer.getLocation(lexer.position);
  const error = createLexerError(message, location.fileName, location.line, location.column);
  throw new Error(formatCompilerError(error));
}

function createPlainLocationResolver(source: string, fileName: string) {
  const lineStarts = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }

  return (offset: number): SourceLocation => {
    const boundedOffset = Math.max(0, Math.min(offset, source.length));
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const start = lineStarts[mid];
      const nextStart = lineStarts[mid + 1] ?? source.length + 1;

      if (boundedOffset < start) {
        high = mid - 1;
        continue;
      }

      if (boundedOffset >= nextStart) {
        low = mid + 1;
        continue;
      }

      return {
        fileName,
        line: mid + 1,
        column: boundedOffset - start + 1,
      };
    }

    return {
      fileName,
      line: 1,
      column: 1,
    };
  };
}
