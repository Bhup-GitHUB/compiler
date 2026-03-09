import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createLexer } from "../src/lexer";
import { emitVerilog } from "../src/netlist";
import { createParser } from "../src/parser";
import { synthesize } from "../src/synthesizer";

function synthesizeSource(source: string, strict = false) {
  const tokens = createLexer(source, "s.v").tokenize();
  const moduleNode = createParser(tokens).parse();
  return synthesize(moduleNode, { strict });
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
    expect(netlist.gates[0].connections).toEqual(["temp", "a", "b"]);
    expect(netlist.gates[1].connections[0]).toBe("_t1");
    expect(netlist.gates[2].connections).toEqual(["y", "temp", "_t1"]);
    expect(netlist.wires).toContain("_t1");
  });

  test("primitive gate instances are preserved", () => {
    const source = "module m(input a, b, output y); and g1(y, a, b); endmodule";
    const netlist = synthesizeSource(source);

    expect(netlist.gates).toEqual([
      {
        gateType: "and",
        name: "g1",
        connections: ["y", "a", "b"],
      },
    ]);
  });

  test("emits verilog output", () => {
    const source = "module m(input a, b, output y); assign y = a & b; endmodule";
    const text = emitVerilog(synthesizeSource(source));

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

  test("strict mode fails on undeclared source", () => {
    const source = "module m(input a, output y); assign y = a & b; endmodule";

    expect(() => synthesizeSource(source, true)).toThrow(
      "m:1:1: undeclared signal 'b'",
    );
  });

  test("duplicate gate name fails", () => {
    const source =
      "module m(input a, b, output y);" +
      "and g1(y, a, b);" +
      "or g1(y, a, b);" +
      "endmodule";

    expect(() => synthesizeSource(source)).toThrow("m:1:1: duplicate gate name 'g1'");
  });

  test("non strict mode auto declares wires", () => {
    const source = "module m(input a, output y); assign y = a & b; endmodule";
    const netlist = synthesizeSource(source);

    expect(netlist.wires).toContain("b");
  });

  test("fixture source synthesizes end to end", () => {
    const source = readFileSync("tests/fixtures/test_basic.v", "utf-8");
    const netlist = synthesizeSource(source);

    expect(netlist.name).toBe("simple_logic_netlist");
    expect(netlist.gates.map((gate) => gate.gateType)).toEqual(["and", "not", "or"]);
  });
});
