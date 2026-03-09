import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("cli", () => {
  test("prints synthesized verilog to stdout", async () => {
    const proc = Bun.spawn(["bun", "run", "src/main.ts", "tests/fixtures/test_basic.v"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("module simple_logic_netlist(a, b, y);");
  });

  test("writes output file when -o is used", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "compiler-cli-"));
    const outputPath = join(tempDir, "out.v");

    const proc = Bun.spawn(
      ["bun", "run", "src/main.ts", "tests/fixtures/test_basic.v", "-o", outputPath],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath, "utf-8")).toContain("module simple_logic_netlist(a, b, y);");
  });

  test("dump flags continue compile", async () => {
    const proc = Bun.spawn(
      [
        "bun",
        "run",
        "src/main.ts",
        "tests/fixtures/test_basic.v",
        "--dump-tokens",
        "--dump-ast",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("MODULE");
    expect(stdout).toContain("\"name\": \"simple_logic\"");
    expect(stdout).toContain("module simple_logic_netlist(a, b, y);");
  });

  test("strict mode exits with failure", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/main.ts", "tests/fixtures/test_strict_fail.v", "--strict"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stdout).toContain("starting synthesizer");
    expect(stderr).toContain("strict_fail:1:1: undeclared signal 'b'");
  });
});
