import { describe, expect, test } from "bun:test";

import {
  CompilerErrorType,
  createCompilerError,
  createLexerError,
  createParserError,
  createSynthesisError,
  formatCompilerError,
} from "../src/errors";
import { TokenType } from "../src/token-types";
import type { Token } from "../src/token";

describe("phase 2 core models", () => {
  test("token type constants exist", () => {
    expect(TokenType.MODULE).toBe("MODULE");
    expect(TokenType.ENDMODULE).toBe("ENDMODULE");
    expect(TokenType.INPUT).toBe("INPUT");
    expect(TokenType.OUTPUT).toBe("OUTPUT");
    expect(TokenType.WIRE).toBe("WIRE");
    expect(TokenType.ASSIGN).toBe("ASSIGN");
    expect(TokenType.KW_AND).toBe("KW_AND");
    expect(TokenType.KW_OR).toBe("KW_OR");
    expect(TokenType.KW_NOT).toBe("KW_NOT");
    expect(TokenType.KW_XOR).toBe("KW_XOR");
    expect(TokenType.KW_NAND).toBe("KW_NAND");
    expect(TokenType.KW_NOR).toBe("KW_NOR");
    expect(TokenType.LOGICAL_AND).toBe("LOGICAL_AND");
    expect(TokenType.LOGICAL_OR).toBe("LOGICAL_OR");
    expect(TokenType.BIT_AND).toBe("BIT_AND");
    expect(TokenType.BIT_OR).toBe("BIT_OR");
    expect(TokenType.BIT_NOT).toBe("BIT_NOT");
    expect(TokenType.BIT_XOR).toBe("BIT_XOR");
    expect(TokenType.EQUALS).toBe("EQUALS");
    expect(TokenType.LPAREN).toBe("LPAREN");
    expect(TokenType.RPAREN).toBe("RPAREN");
    expect(TokenType.SEMICOLON).toBe("SEMICOLON");
    expect(TokenType.COMMA).toBe("COMMA");
    expect(TokenType.IDENTIFIER).toBe("IDENTIFIER");
    expect(TokenType.NUMBER).toBe("NUMBER");
    expect(TokenType.EOF).toBe("EOF");
  });

  test("token shape is straightforward", () => {
    const token: Token = {
      type: TokenType.IDENTIFIER,
      value: "hello",
      line: 2,
      column: 5,
      fileName: "test.v",
    };

    expect(token.type).toBe("IDENTIFIER");
    expect(token.value).toBe("hello");
    expect(token.line).toBe(2);
    expect(token.column).toBe(5);
    expect(token.fileName).toBe("test.v");
  });

  test("compiler errors keep message and location", () => {
    const error = createCompilerError(
      CompilerErrorType.COMPILER,
      "bad thing",
      "main.v",
      3,
      9,
    );

    expect(formatCompilerError(error)).toBe("main.v:3:9: bad thing");
    expect(error.type).toBe("COMPILER");
    expect(error.message).toBe("bad thing");
    expect(error.fileName).toBe("main.v");
    expect(error.line).toBe(3);
    expect(error.column).toBe(9);
  });

  test("specific compiler error creators exist", () => {
    expect(createLexerError("lex", "a.v", 1, 1).type).toBe("LEXER");
    expect(createParserError("parse", "a.v", 1, 1).type).toBe("PARSER");
    expect(createSynthesisError("synth", "a.v", 1, 1).type).toBe("SYNTHESIS");
  });
});
