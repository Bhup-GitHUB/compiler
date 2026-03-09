import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createLexer } from "../src/lexer";
import { emitVerilog } from "../src/netlist";
import { createParser } from "../src/parser";
import { synthesize, synthesizeCompilationUnit } from "../src/synthesizer";

function parseModule(source: string, fileName = "s.v") {
  const tokens = createLexer(source, fileName).tokenize();
  return createParser(tokens).parse();
}

function parseUnit(source: string, fileName = "s.v") {
  const tokens = createLexer(source, fileName).tokenize();
  return createParser(tokens).parseCompilationUnit();
}

function synthesizeSource(source: string, strict = false) {
  return synthesize(parseModule(source), { strict });
}

describe("synthesizer", () => {
  test("assign chain is lowered to gates", () => {
    const source =
      "module simple_logic(input a, b, output y);" +
      "wire temp;" +
      "assign temp = a & b;" +
      "assign y = temp | ~a;" +
      "endmodule";

    const netlist = synthesizeSource(source);

    expect(netlist.gates.map((gate) => gate.gateType)).toEqual(["and", "not", "or"]);
    expect(netlist.gates.map((gate) => gate.name)).toEqual(["gate_1", "gate_2", "gate_3"]);
  });

  test("primitive gate instances are preserved", () => {
    const netlist = synthesizeSource("module m(input a, b, output y); and g1(y, a, b); endmodule");

    expect(netlist.gates).toEqual([
      {
        gateType: "and",
        name: "g1",
        connections: ["y", "a", "b"],
      },
    ]);
  });

  test("emits verilog output", () => {
    const text = emitVerilog(
      synthesizeSource("module m(input a, b, output y); assign y = a & b; endmodule"),
    );

    expect(text).toContain("module m_netlist(a, b, y);");
    expect(text).toContain("and gate_1(y, a, b);");
    expect(text.endsWith("endmodule\n")).toBe(true);
  });

  test("output is deterministic", () => {
    const source = "module m(input a, b, output y); assign y = a ^ b; endmodule";
    const first = emitVerilog(synthesizeSource(source));
    const second = emitVerilog(synthesizeSource(source));

    expect(first).toBe(second);
  });

  test("strict mode fails on undeclared source with exact location", () => {
    expect(() => synthesizeSource("module m(input a, output y); assign y = a & b; endmodule", true)).toThrow(
      "s.v:1:45: undeclared signal 'b'",
    );
  });

  test("duplicate gate name fails with exact location", () => {
    const source =
      "module m(input a, b, output y);" +
      "and g1(y, a, b);" +
      "or g1(y, a, b);" +
      "endmodule";

    expect(() => synthesizeSource(source)).toThrow("s.v:1:51: duplicate gate name 'g1'");
  });

  test("duplicate module definitions fail across compilation unit", () => {
    const unit = parseUnit("module m(); endmodule module m(); endmodule");

    expect(() => synthesizeCompilationUnit(unit)).toThrow(
      "s.v:1:30: duplicate module definition 'm'",
    );
  });

  test("non strict mode auto declares wires", () => {
    const netlist = synthesizeSource("module m(input a, output y); assign y = a & b; endmodule");

    expect(netlist.wires).toContain("b");
  });

  test("fixture source synthesizes end to end", () => {
    const source = readFileSync("tests/fixtures/test_basic.v", "utf-8");
    const netlist = synthesize(parseModule(source, "tests/fixtures/test_basic.v"));

    expect(netlist.name).toBe("simple_logic_netlist");
    expect(netlist.gates.map((gate) => gate.gateType)).toEqual(["and", "not", "or"]);
  });
});
