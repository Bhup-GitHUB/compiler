import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { BinaryExpr, Expr, ModuleNode } from "../src/ast";
import { createLexer } from "../src/lexer";
import { createParser } from "../src/parser";

function parse(source: string, fileName = "p.v"): ModuleNode {
  const tokens = createLexer(source, fileName).tokenize();
  return createParser(tokens).parse();
}

function parseUnit(source: string, fileName = "p.v") {
  const tokens = createLexer(source, fileName).tokenize();
  return createParser(tokens).parseCompilationUnit();
}

describe("ast", () => {
  test("ast shapes are plain readable objects", () => {
    const expr: Expr = {
      kind: "BinaryExpr",
      op: "&",
      left: {
        kind: "IdentifierExpr",
        name: "a",
        span: {
          start: { fileName: "a.v", line: 1, column: 1 },
          end: { fileName: "a.v", line: 1, column: 1 },
        },
      },
      right: {
        kind: "IdentifierExpr",
        name: "b",
        span: {
          start: { fileName: "a.v", line: 1, column: 5 },
          end: { fileName: "a.v", line: 1, column: 5 },
        },
      },
      span: {
        start: { fileName: "a.v", line: 1, column: 1 },
        end: { fileName: "a.v", line: 1, column: 5 },
      },
    };

    expect(expr.kind).toBe("BinaryExpr");
    expect(expr.span.start.fileName).toBe("a.v");
  });
});

describe("parser", () => {
  test("parses module name and grouped ports", () => {
    const moduleNode = parse("module m(input a, b, output y); endmodule");

    expect(moduleNode.name).toBe("m");
    expect(moduleNode.ports.map((port) => ({ direction: port.direction, names: port.names }))).toEqual([
      {
        direction: "input",
        names: ["a", "b"],
      },
      {
        direction: "output",
        names: ["y"],
      },
    ]);
  });

  test("parses wire declarations", () => {
    const moduleNode = parse("module m(input a, output y); wire x, z; endmodule");

    expect(moduleNode.wires.map((wire) => wire.names)).toEqual([["x", "z"]]);
  });

  test("parses assign statements with identifier rhs", () => {
    const moduleNode = parse("module m(input a, output y); assign y = a; endmodule");

    expect(moduleNode.assigns[0].target).toBe("y");
    expect(moduleNode.assigns[0].expr).toMatchObject({
      kind: "IdentifierExpr",
      name: "a",
    });
  });

  test("parses assign statements with number rhs", () => {
    const moduleNode = parse("module m(output y); assign y = 1; endmodule");

    expect(moduleNode.assigns[0].expr).toMatchObject({
      kind: "NumberExpr",
      value: "1",
    });
  });

  test("parses primitive gate instantiations", () => {
    const moduleNode = parse("module m(input a, b, output y); and g1(y, a, b); endmodule");

    expect(moduleNode.gates[0]).toMatchObject({
      gateType: "and",
      name: "g1",
      connections: ["y", "a", "b"],
    });
  });

  test("parses operator precedence for bitwise expressions", () => {
    const moduleNode = parse(
      "module m(input a, b, c, d, output y); assign y = a | b ^ c & ~d; endmodule",
    );

    const expr = moduleNode.assigns[0].expr as BinaryExpr;

    expect(expr.op).toBe("|");
    expect((expr.right as BinaryExpr).op).toBe("^");
    expect((((expr.right as BinaryExpr).right as BinaryExpr).op)).toBe("&");
  });

  test("tracks source span for parsed statements", () => {
    const moduleNode = parse("module m(input a, output y);\nassign y = a;\nendmodule");

    expect(moduleNode.assigns[0].span.start).toEqual({
      fileName: "p.v",
      line: 2,
      column: 1,
    });
    expect(moduleNode.assigns[0].targetSpan.start.column).toBe(8);
  });

  test("rejects malformed syntax with token context", () => {
    expect(() => parse("module m(input a; endmodule")).toThrow(
      "p.v:1:17: expected RPAREN, got SEMICOLON(';')",
    );
  });

  test("parses multiple modules in one compilation unit", () => {
    const unit = parseUnit("module a(); endmodule module b(); endmodule");

    expect(unit.modules.map((moduleNode) => moduleNode.name)).toEqual(["a", "b"]);
  });

  test("single-module parse rejects trailing modules", () => {
    expect(() => parse("module a(); endmodule module b(); endmodule")).toThrow(
      "p.v:1:23: expected EOF after first module",
    );
  });

  test("parses fixture file", () => {
    const source = readFileSync("tests/fixtures/test_basic.v", "utf-8");
    const moduleNode = parse(source, "tests/fixtures/test_basic.v");

    expect(moduleNode.name).toBe("simple_logic");
    expect(moduleNode.assigns).toHaveLength(2);
  });

  test("debug mode still parses", () => {
    const tokens = createLexer("module m(input a, output y); assign y = a; endmodule").tokenize();
    const moduleNode = createParser(tokens, { debug: true }).parse();

    expect(moduleNode.name).toBe("m");
  });
});
