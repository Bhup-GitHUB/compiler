import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createLexer } from "../src/lexer";
import { TokenType } from "../src/token-types";

function tokenize(source: string, fileName = "t.v") {
  return createLexer(source, fileName).tokenize();
}

describe("lexer", () => {
  test("tokenizes minimal module", () => {
    const tokens = tokenize("module test();");

    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.MODULE,
      TokenType.IDENTIFIER,
      TokenType.LPAREN,
      TokenType.RPAREN,
      TokenType.SEMICOLON,
      TokenType.EOF,
    ]);
  });

  test("skips leading and trailing whitespace", () => {
    const tokens = tokenize("   \n\tmodule test();   ");

    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.MODULE,
      TokenType.IDENTIFIER,
      TokenType.LPAREN,
      TokenType.RPAREN,
      TokenType.SEMICOLON,
      TokenType.EOF,
    ]);
  });

  test("emits eof only once", () => {
    const tokens = tokenize("module test();");

    expect(tokens.filter((token) => token.type === TokenType.EOF)).toHaveLength(1);
  });

  test("tracks line and column for minimal module", () => {
    const tokens = tokenize("module test();", "simple.v");

    expect(tokens[0]).toMatchObject({
      type: TokenType.MODULE,
      value: "module",
      line: 1,
      column: 1,
      fileName: "simple.v",
    });

    expect(tokens[1]).toMatchObject({
      type: TokenType.IDENTIFIER,
      value: "test",
      line: 1,
      column: 8,
      fileName: "simple.v",
    });
  });

  test("tokenizes port list", () => {
    const tokens = tokenize("module m(input a, b, output y);");

    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.MODULE,
      TokenType.IDENTIFIER,
      TokenType.LPAREN,
      TokenType.INPUT,
      TokenType.IDENTIFIER,
      TokenType.COMMA,
      TokenType.IDENTIFIER,
      TokenType.COMMA,
      TokenType.OUTPUT,
      TokenType.IDENTIFIER,
      TokenType.RPAREN,
      TokenType.SEMICOLON,
      TokenType.EOF,
    ]);
  });

  test("tokenizes assign expression", () => {
    const tokens = tokenize("assign y = a & b | ~c ^ d;");

    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.ASSIGN,
      TokenType.IDENTIFIER,
      TokenType.EQUALS,
      TokenType.IDENTIFIER,
      TokenType.BIT_AND,
      TokenType.IDENTIFIER,
      TokenType.BIT_OR,
      TokenType.BIT_NOT,
      TokenType.IDENTIFIER,
      TokenType.BIT_XOR,
      TokenType.IDENTIFIER,
      TokenType.SEMICOLON,
      TokenType.EOF,
    ]);
  });

  test("tokenizes primitive keywords", () => {
    const tokens = tokenize("and or not xor nand nor");

    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.KW_AND,
      TokenType.KW_OR,
      TokenType.KW_NOT,
      TokenType.KW_XOR,
      TokenType.KW_NAND,
      TokenType.KW_NOR,
      TokenType.EOF,
    ]);
  });

  test("tokenizes logical vs bitwise operators", () => {
    const tokens = tokenize("a && b || c & d | e");

    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.IDENTIFIER,
      TokenType.LOGICAL_AND,
      TokenType.IDENTIFIER,
      TokenType.LOGICAL_OR,
      TokenType.IDENTIFIER,
      TokenType.BIT_AND,
      TokenType.IDENTIFIER,
      TokenType.BIT_OR,
      TokenType.IDENTIFIER,
      TokenType.EOF,
    ]);
  });

  test("tokenizes decimal numbers", () => {
    const tokens = tokenize("assign y = 42;");

    expect(tokens.filter((token) => token.type === TokenType.NUMBER).map((token) => token.value)).toEqual([
      "42",
    ]);
  });

  test("tokenizes based numbers", () => {
    const tokens = tokenize("assign y = 8'b1010; assign z = 16'h1F; assign q = 4'd9;");

    expect(tokens.filter((token) => token.type === TokenType.NUMBER).map((token) => token.value)).toEqual([
      "8'b1010",
      "16'h1F",
      "4'd9",
    ]);
  });

  test("skips line comments", () => {
    const tokens = tokenize("// comment\nmodule a();");

    expect(tokens[0].type).toBe(TokenType.MODULE);
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
  });

  test("skips block comments across lines", () => {
    const tokens = tokenize("/* one\n two */ module a();");

    expect(tokens[0].type).toBe(TokenType.MODULE);
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
  });

  test("raises on unterminated block comment", () => {
    expect(() => tokenize("/* no end", "err.v")).toThrow(
      "err.v:1:1: unterminated block comment",
    );
  });

  test("raises on invalid characters", () => {
    expect(() => tokenize("module test@();", "err.v")).toThrow(
      "err.v:1:12: invalid character '@'",
    );
  });

  test("raises on invalid numbers", () => {
    expect(() => tokenize("assign y = 123abc;", "err.v")).toThrow(
      "err.v:1:12: invalid number literal '123abc'",
    );
  });

  test("tokenizes fixture file", () => {
    const source = readFileSync("tests/fixtures/test_basic.v", "utf-8");
    const tokens = tokenize(source, "tests/fixtures/test_basic.v");

    expect(tokens[0].type).toBe(TokenType.MODULE);
    expect(tokens.some((token) => token.type === TokenType.WIRE)).toBe(true);
    expect(tokens.some((token) => token.type === TokenType.ASSIGN)).toBe(true);
    expect(tokens.at(-1)?.type).toBe(TokenType.EOF);
  });

  test("tracks line and column across lines", () => {
    const tokens = tokenize("module a();\nassign y = 1;\nendmodule");
    const assignToken = tokens.find((token) => token.type === TokenType.ASSIGN);
    const endmoduleToken = tokens.find((token) => token.type === TokenType.ENDMODULE);

    expect(assignToken).toMatchObject({
      line: 2,
      column: 1,
    });

    expect(endmoduleToken).toMatchObject({
      line: 3,
      column: 1,
    });
  });

  test("returns deterministic token streams", () => {
    const source = "module m(input a, output y); assign y = a | ~a; endmodule";
    const first = tokenize(source);
    const second = tokenize(source);

    expect(first).toEqual(second);
  });
});
