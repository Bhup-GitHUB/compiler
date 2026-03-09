import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
    expect(stdout).toContain("reading tests/fixtures/test_basic.v");
    expect(stdout).toContain("running compiler pipeline");
    expect(stdout).toContain("emitting netlist to stdout");
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
    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("reading tests/fixtures/test_basic.v");
    expect(stdout).toContain("running compiler pipeline");
    expect(stdout).toContain(`writing ${outputPath}`);
  });

  test("dump flags emit tokens, ast, and output", async () => {
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
    expect(stdout).toContain("reading tests/fixtures/test_basic.v");
    expect(stdout).toContain("MODULE");
    expect(stdout).toContain("\"modules\": [");
    expect(stdout).toContain("module simple_logic_netlist(a, b, y);");
  });

  test("repeated cli runs are byte-identical", async () => {
    const first = Bun.spawn(["bun", "run", "src/main.ts", "tests/fixtures/test_basic.v"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const second = Bun.spawn(["bun", "run", "src/main.ts", "tests/fixtures/test_basic.v"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const firstStdout = await new Response(first.stdout).text();
    const secondStdout = await new Response(second.stdout).text();
    const firstStderr = await new Response(first.stderr).text();
    const secondStderr = await new Response(second.stderr).text();

    expect(await first.exited).toBe(0);
    expect(await second.exited).toBe(0);
    expect(firstStdout).toBe(secondStdout);
    expect(firstStderr).toBe(secondStderr);
  });

  test("strict mode exits with failure and exact location", async () => {
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
    expect(stdout).toContain("reading tests/fixtures/test_strict_fail.v");
    expect(stdout).toContain("running compiler pipeline");
    expect(stderr).toContain("test_strict_fail.v:2:18: undeclared signal 'b'");
  });

  test("multi-file includes compile through the cli", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "compiler-cli-multi-"));
    writeFileSync(join(tempDir, "defs.vh"), "`define TAP a & b\n", "utf-8");
    writeFileSync(
      join(tempDir, "main.v"),
      "`include \"defs.vh\"\nmodule top(input a, b, output y);\nassign y = `TAP;\nendmodule\n",
      "utf-8",
    );

    const proc = Bun.spawn(["bun", "run", "src/main.ts", join(tempDir, "main.v")], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("module top_netlist(a, b, y);");
  });
});
