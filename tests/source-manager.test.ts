import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createSourceManager } from "../src/source-manager";
import { preprocessSource } from "../src/preprocessor";

describe("source manager", () => {
  test("loads one file and computes locations", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "compiler-source-"));
    const filePath = join(tempDir, "one.v");
    writeFileSync(filePath, "module x();\nendmodule\n", "utf-8");

    const manager = createSourceManager();
    const source = manager.loadFile(filePath);

    expect(source.fileName).toBe(filePath);
    expect(manager.getLocation(filePath, 12)).toEqual({
      fileName: filePath,
      line: 2,
      column: 1,
    });
  });

  test("canonicalizes repeated file loads", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "compiler-source-"));
    const filePath = join(tempDir, "same.v");
    writeFileSync(filePath, "module x(); endmodule\n", "utf-8");

    const manager = createSourceManager();
    const first = manager.loadFile(filePath);
    const second = manager.loadFile(join(tempDir, ".", "same.v"));

    expect(first).toBe(second);
  });

  test("registers virtual sources without changing parser behavior", () => {
    const manager = createSourceManager();
    const source = manager.addSource("<memory>", "module x(); endmodule");

    expect(source.fileName).toBe("<memory>");
    expect(manager.getLineText("<memory>", 1)).toBe("module x(); endmodule");
  });
});

describe("preprocessor", () => {
  test("expands includes and macros deterministically", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "compiler-pre-"));
    const defsPath = join(tempDir, "defs.vh");
    const mainPath = join(tempDir, "main.v");

    writeFileSync(defsPath, "`define TAP a & b\n", "utf-8");
    writeFileSync(
      mainPath,
      "`include \"defs.vh\"\nmodule top(input a, b, output y);\nassign y = `TAP;\nendmodule\n",
      "utf-8",
    );

    const manager = createSourceManager();
    const first = preprocessSource(manager, manager.loadFile(mainPath));
    const second = preprocessSource(manager, manager.loadFile(mainPath));

    expect(first.text).toContain("assign y = a & b;");
    expect(first.text).toBe(second.text);
  });

  test("maps macro-expanded text back to original source line", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "compiler-pre-"));
    const defsPath = join(tempDir, "defs.vh");
    const mainPath = join(tempDir, "main.v");

    writeFileSync(defsPath, "`define TAP a & b\n", "utf-8");
    writeFileSync(
      mainPath,
      "`include \"defs.vh\"\nmodule top(input a, b, output y);\nassign y = `TAP;\nendmodule\n",
      "utf-8",
    );

    const manager = createSourceManager();
    const preprocessed = preprocessSource(manager, manager.loadFile(mainPath));
    const assignIndex = preprocessed.text.indexOf("a & b");

    expect(preprocessed.getLocation(assignIndex)).toEqual({
      fileName: mainPath,
      line: 3,
      column: 12,
    });
  });

  test("fails on missing includes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "compiler-pre-"));
    const mainPath = join(tempDir, "main.v");
    writeFileSync(mainPath, "`include \"missing.vh\"\nmodule top(); endmodule\n", "utf-8");

    const manager = createSourceManager();

    expect(() => preprocessSource(manager, manager.loadFile(mainPath))).toThrow(
      `missing include 'missing.vh'`,
    );
  });

  test("fails on unknown macros", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "compiler-pre-"));
    const mainPath = join(tempDir, "main.v");
    writeFileSync(mainPath, "module top();\nassign y = `NOPE;\nendmodule\n", "utf-8");

    const manager = createSourceManager();

    expect(() => preprocessSource(manager, manager.loadFile(mainPath))).toThrow(
      `unknown macro 'NOPE'`,
    );
  });
});
