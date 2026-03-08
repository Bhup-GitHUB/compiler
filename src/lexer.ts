import { createLexerError, formatCompilerError } from "./errors";
import type { Token } from "./token";
import { TokenType } from "./token-types";

type CreateLexerOptions = {
  debug?: boolean;
};

type Lexer = {
  source: string;
  fileName: string;
  position: number;
  line: number;
  column: number;
  debug: boolean;
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
  source: string,
  fileName = "<memory>",
  options: CreateLexerOptions = {},
): Lexer {
  const lexer: Lexer = {
    source,
    fileName,
    position: 0,
    line: 1,
    column: 1,
    debug: options.debug === true,
    tokenize: () => tokenize(lexer),
  };

  return lexer;
}

function tokenize(lexer: Lexer): Token[] {
  const tokens: Token[] = [];

  while (lexer.position < lexer.source.length) {
    const char = currentChar(lexer);
    logDebug(lexer, "current char", char);

    skipWhitespace(lexer);

    if (lexer.position >= lexer.source.length) {
      break;
    }

    skipComments(lexer);

    if (lexer.position >= lexer.source.length) {
      break;
    }

    const token = readNextToken(lexer);
    tokens.push(token);
    logDebug(lexer, "token created", token);
  }

  const eofToken = createToken(lexer, TokenType.EOF, "", lexer.line, lexer.column);
  tokens.push(eofToken);
  logDebug(lexer, "token created", eofToken);
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
    advance(lexer, char);
  }
}

function skipComments(lexer: Lexer): void {
  while (true) {
    if (currentChar(lexer) === "/" && peek(lexer) === "/") {
      skipLineComment(lexer);
      skipWhitespace(lexer);
      continue;
    }

    if (currentChar(lexer) === "/" && peek(lexer) === "*") {
      skipBlockComment(lexer);
      skipWhitespace(lexer);
      continue;
    }

    return;
  }
}

function skipLineComment(lexer: Lexer): void {
  while (lexer.position < lexer.source.length) {
    const char = currentChar(lexer);
    advance(lexer, char);
    if (char === "\n") {
      return;
    }
  }
}

function skipBlockComment(lexer: Lexer): void {
  const startLine = lexer.line;
  const startColumn = lexer.column;

  advance(lexer, "/");
  advance(lexer, "*");

  while (lexer.position < lexer.source.length) {
    if (currentChar(lexer) === "*" && peek(lexer) === "/") {
      advance(lexer, "*");
      advance(lexer, "/");
      return;
    }

    advance(lexer, currentChar(lexer));
  }

  const error = createLexerError(
    "unterminated block comment",
    lexer.fileName,
    startLine,
    startColumn,
  );
  throw new Error(formatCompilerError(error));
}

function readIdentifierOrKeyword(lexer: Lexer): Token {
  const startLine = lexer.line;
  const startColumn = lexer.column;
  let value = "";

  while (lexer.position < lexer.source.length) {
    const char = currentChar(lexer);
    if (!isIdentifierPart(char)) {
      break;
    }
    value += char;
    advance(lexer, char);
  }

  const tokenType = KEYWORD_TOKEN_MAP[value] ?? TokenType.IDENTIFIER;
  return createToken(lexer, tokenType, value, startLine, startColumn);
}

function readNumber(lexer: Lexer): Token {
  const startLine = lexer.line;
  const startColumn = lexer.column;
  const remaining = lexer.source.slice(lexer.position);
  const invalidMixed = remaining.match(INVALID_MIXED_NUMBER);

  if (invalidMixed) {
    raiseLexerError(lexer, `invalid number literal '${invalidMixed[0]}'`);
  }

  let value = "";

  while (lexer.position < lexer.source.length && isDigit(currentChar(lexer))) {
    const char = currentChar(lexer);
    value += char;
    advance(lexer, char);
  }

  if (currentChar(lexer) === "'") {
    const rest = lexer.source.slice(lexer.position + 1);
    const basedNumber = rest.match(BASED_NUMBER_REST);

    if (!basedNumber) {
      raiseLexerError(lexer, `invalid number literal '${value}'`);
    }

    value += "'";
    advance(lexer, "'");

    for (const char of basedNumber[0]) {
      value += char;
      advance(lexer, char);
    }
  }

  return createToken(lexer, TokenType.NUMBER, value, startLine, startColumn);
}

function readSingleCharToken(lexer: Lexer, type: Token["type"]): Token {
  const startLine = lexer.line;
  const startColumn = lexer.column;
  const value = currentChar(lexer);
  advance(lexer, value);
  return createToken(lexer, type, value, startLine, startColumn);
}

function readDoubleCharToken(lexer: Lexer, type: Token["type"]): Token {
  const startLine = lexer.line;
  const startColumn = lexer.column;
  const first = currentChar(lexer);
  const second = peek(lexer);
  advance(lexer, first);
  advance(lexer, second);
  return createToken(lexer, type, `${first}${second}`, startLine, startColumn);
}

function createToken(
  lexer: Lexer,
  type: Token["type"],
  value: string,
  line: number,
  column: number,
): Token {
  return {
    type,
    value,
    line,
    column,
    fileName: lexer.fileName,
  };
}

function currentChar(lexer: Lexer): string {
  return lexer.source[lexer.position] ?? "";
}

function peek(lexer: Lexer): string {
  return lexer.source[lexer.position + 1] ?? "";
}

function advance(lexer: Lexer, char: string): void {
  lexer.position += 1;

  if (char === "\n") {
    lexer.line += 1;
    lexer.column = 1;
    return;
  }

  lexer.column += 1;
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
  const error = createLexerError(message, lexer.fileName, lexer.line, lexer.column);
  throw new Error(formatCompilerError(error));
}

function logDebug(lexer: Lexer, label: string, value: unknown): void {
  if (!lexer.debug) {
    return;
  }

  console.log(label, value);
}

