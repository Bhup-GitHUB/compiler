import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { BinaryExpr, Expr, ModuleNode } from "../src/ast";
import { createLexer } from "../src/lexer";
import { createParser } from "../src/parser";

function parse(source: string, fileName = "p.v"): ModuleNode {
  const tokens = createLexer(source, fileName).tokenize();
  return createParser(tokens).parse();
}

describe("ast", () => {
  test("ast shapes are plain readable objects", () => {
    const expr: Expr = {
      kind: "BinaryExpr",
      op: "&",
      left: {
        kind: "IdentifierExpr",
        name: "a",
      },
      right: {
        kind: "IdentifierExpr",
        name: "b",
      },
    };

    expect(expr).toEqual({
      kind: "BinaryExpr",
      op: "&",
      left: {
        kind: "IdentifierExpr",
        name: "a",
      },
      right: {
        kind: "IdentifierExpr",
        name: "b",
      },
    });
  });
});

describe("parser", () => {
  test("parses module name and grouped ports", () => {
    const moduleNode = parse("module m(input a, b, output y); endmodule");

    expect(moduleNode.name).toBe("m");
    expect(moduleNode.ports).toEqual([
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

    expect(moduleNode.wires).toEqual([
      {
        names: ["x", "z"],
      },
    ]);
  });

  test("parses assign statements with identifier rhs", () => {
    const moduleNode = parse("module m(input a, output y); assign y = a; endmodule");

    expect(moduleNode.assigns).toEqual([
      {
        target: "y",
        expr: {
          kind: "IdentifierExpr",
          name: "a",
        },
      },
    ]);
  });

  test("parses assign statements with number rhs", () => {
    const moduleNode = parse("module m(output y); assign y = 1; endmodule");

    expect(moduleNode.assigns).toEqual([
      {
        target: "y",
        expr: {
          kind: "NumberExpr",
          value: "1",
        },
      },
    ]);
  });

  test("parses primitive gate instantiations", () => {
    const moduleNode = parse("module m(input a, b, output y); and g1(y, a, b); endmodule");

    expect(moduleNode.gates).toEqual([
      {
        gateType: "and",
        name: "g1",
        connections: ["y", "a", "b"],
      },
    ]);
  });

  test("parses a module with mixed body items in order buckets", () => {
    const source =
      "module m(input a, b, output y);" +
      "wire temp;" +
      "assign temp = a & b;" +
      "or g1(y, temp, a);" +
      "endmodule";

    const moduleNode = parse(source);

    expect(moduleNode.wires).toEqual([{ names: ["temp"] }]);
    expect(moduleNode.assigns).toHaveLength(1);
    expect(moduleNode.gates).toEqual([
      {
        gateType: "or",
        name: "g1",
        connections: ["y", "temp", "a"],
      },
    ]);
  });

  test("parses parenthesized expressions", () => {
    const moduleNode = parse("module m(input a, b, output y); assign y = (a & b); endmodule");

    expect(moduleNode.assigns[0].expr).toEqual({
      kind: "BinaryExpr",
      op: "&",
      left: {
        kind: "IdentifierExpr",
        name: "a",
      },
      right: {
        kind: "IdentifierExpr",
        name: "b",
      },
    });
  });

  test("parses unary bit not", () => {
    const moduleNode = parse("module m(input a, output y); assign y = ~a; endmodule");

    expect(moduleNode.assigns[0].expr).toEqual({
      kind: "UnaryExpr",
      op: "~",
      operand: {
        kind: "IdentifierExpr",
        name: "a",
      },
    });
  });

  test("parses unary keyword not", () => {
    const moduleNode = parse("module m(input a, output y); assign y = not a; endmodule");

    expect(moduleNode.assigns[0].expr).toEqual({
      kind: "UnaryExpr",
      op: "not",
      operand: {
        kind: "IdentifierExpr",
        name: "a",
      },
    });
  });

  test("parses operator precedence for bitwise expressions", () => {
    const moduleNode = parse(
      "module m(input a, b, c, d, output y); assign y = a | b ^ c & ~d; endmodule",
    );

    const expr = moduleNode.assigns[0].expr as BinaryExpr;

    expect(expr.kind).toBe("BinaryExpr");
    expect(expr.op).toBe("|");
    expect((expr.right as BinaryExpr).op).toBe("^");
    expect((((expr.right as BinaryExpr).right as BinaryExpr)).op).toBe("&");
    expect((((expr.right as BinaryExpr).right as BinaryExpr).right)).toEqual({
      kind: "UnaryExpr",
      op: "~",
      operand: {
        kind: "IdentifierExpr",
        name: "d",
      },
    });
  });

  test("logical operators bind weaker than bitwise ones", () => {
    const moduleNode = parse(
      "module m(input a, b, c, d, e, output y); assign y = a || b && c | d & e; endmodule",
    );

    const expr = moduleNode.assigns[0].expr as BinaryExpr;
    expect(expr.op).toBe("||");
    expect((expr.right as BinaryExpr).op).toBe("&&");
    expect((((expr.right as BinaryExpr).right) as BinaryExpr).op).toBe("|");
  });

  test("parses nested expressions", () => {
    const moduleNode = parse(
      "module m(input a, b, c, d, output y); assign y = ((a | b) & (c ^ d)); endmodule",
    );

    expect(moduleNode.assigns[0].expr).toEqual({
      kind: "BinaryExpr",
      op: "&",
      left: {
        kind: "BinaryExpr",
        op: "|",
        left: {
          kind: "IdentifierExpr",
          name: "a",
        },
        right: {
          kind: "IdentifierExpr",
          name: "b",
        },
      },
      right: {
        kind: "BinaryExpr",
        op: "^",
        left: {
          kind: "IdentifierExpr",
          name: "c",
        },
        right: {
          kind: "IdentifierExpr",
          name: "d",
        },
      },
    });
  });

  test("rejects unexpected tokens in module body", () => {
    expect(() => parse("module m(input a); output y; endmodule")).toThrow(
      "p.v:1:20: unexpected token OUTPUT",
    );
  });

  test("rejects missing required punctuation", () => {
    expect(() => parse("module m(input a; endmodule")).toThrow(
      "p.v:1:17: expected one of [RPAREN] got SEMICOLON",
    );
  });

  test("rejects malformed gate instance syntax", () => {
    expect(() => parse("module m(input a, output y); and g1(y, , a); endmodule")).toThrow(
      "p.v:1:40: expected identifier or number in connection list",
    );
  });

  test("rejects malformed port list syntax", () => {
    expect(() => parse("module m(a, output y); endmodule")).toThrow(
      "p.v:1:10: expected input or output",
    );
  });

  test("rejects extra tokens after endmodule", () => {
    expect(() => parse("module m(); endmodule module x(); endmodule")).toThrow(
      "p.v:1:23: expected one of [EOF] got MODULE",
    );
  });

  test("parses fixture file", () => {
    const source = readFileSync("tests/fixtures/test_basic.v", "utf-8");
    const moduleNode = parse(source, "tests/fixtures/test_basic.v");

    expect(moduleNode.name).toBe("simple_logic");
    expect(moduleNode.wires).toEqual([{ names: ["temp"] }]);
    expect(moduleNode.assigns).toHaveLength(2);
  });

  test("debug mode still parses", () => {
    const tokens = createLexer("module m(input a, output y); assign y = a; endmodule").tokenize();
    const moduleNode = createParser(tokens, { debug: true }).parse();

    expect(moduleNode.name).toBe("m");
  });
});
