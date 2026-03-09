import type { SourceLocation } from "./ast";
import { createPreprocessorError, formatCompilerError } from "./errors";
import type { SourceFile, SourceManager } from "./source-manager";

export type PreprocessedSource = {
  fileName: string;
  text: string;
  getLocation: (offset: number) => SourceLocation;
};

type MappingEntry = {
  generatedStart: number;
  generatedEnd: number;
  sourceLocation: SourceLocation;
};

type PreprocessorState = {
  sourceManager: SourceManager;
  macros: Map<string, string>;
  output: string[];
  mappings: MappingEntry[];
  offset: number;
};

const DEFINE_RE = /^\s*`define\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/;
const INCLUDE_RE = /^\s*`include\s+"([^"]+)"\s*$/;
const MACRO_USE_RE = /`([A-Za-z_][A-Za-z0-9_]*)/g;

export function preprocessSource(
  sourceManager: SourceManager,
  entrySource: SourceFile,
): PreprocessedSource {
  const state: PreprocessorState = {
    sourceManager,
    macros: new Map(),
    output: [],
    mappings: [],
    offset: 0,
  };

  expandFile(state, entrySource);

  return {
    fileName: entrySource.fileName,
    text: state.output.join(""),
    getLocation(offset) {
      return mapLocation(state.mappings, entrySource.fileName, offset);
    },
  };
}

function expandFile(state: PreprocessorState, source: SourceFile): void {
  const lines = splitLines(source.text);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = stripTrailingLineBreak(line.text);
    const lineNumber = index + 1;
    const defineMatch = trimmed.match(DEFINE_RE);

    if (defineMatch) {
      state.macros.set(defineMatch[1], defineMatch[2] ?? "");
      continue;
    }

    const includeMatch = trimmed.match(INCLUDE_RE);

    if (includeMatch) {
      const includePath = state.sourceManager.resolvePath(source.fileName, includeMatch[1]);
      let included: SourceFile;

      try {
        included = state.sourceManager.loadFile(includePath);
      } catch {
        throwPreprocessorError(
          `missing include '${includeMatch[1]}'`,
          source.fileName,
          lineNumber,
          1,
        );
      }

      expandFile(state, included);
      continue;
    }

    emitExpandedLine(state, source.fileName, lineNumber, line.text);
  }
}

function emitExpandedLine(
  state: PreprocessorState,
  fileName: string,
  lineNumber: number,
  text: string,
): void {
  let index = 0;

  for (const match of text.matchAll(MACRO_USE_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    emitSegment(state, fileName, lineNumber, index + 1, text.slice(index, start));

    const macroName = match[1];
    const macroValue = state.macros.get(macroName);

    if (macroValue === undefined) {
      throwPreprocessorError(`unknown macro '${macroName}'`, fileName, lineNumber, start + 1);
    }

    emitSegment(state, fileName, lineNumber, start + 1, macroValue);
    index = end;
  }

  emitSegment(state, fileName, lineNumber, index + 1, text.slice(index));
}

function emitSegment(
  state: PreprocessorState,
  fileName: string,
  lineNumber: number,
  column: number,
  text: string,
): void {
  if (text.length === 0) {
    return;
  }

  state.output.push(text);
  state.mappings.push({
    generatedStart: state.offset,
    generatedEnd: state.offset + text.length,
    sourceLocation: {
      fileName,
      line: lineNumber,
      column,
    },
  });
  state.offset += text.length;
}

function mapLocation(
  mappings: MappingEntry[],
  fallbackFileName: string,
  offset: number,
): SourceLocation {
  for (const mapping of mappings) {
    if (offset < mapping.generatedStart || offset > mapping.generatedEnd) {
      continue;
    }

    return {
      fileName: mapping.sourceLocation.fileName,
      line: mapping.sourceLocation.line,
      column: mapping.sourceLocation.column + Math.max(0, offset - mapping.generatedStart),
    };
  }

  return {
    fileName: fallbackFileName,
    line: 1,
    column: 1,
  };
}

function splitLines(text: string): { text: string }[] {
  const lines: { text: string }[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") {
      continue;
    }

    lines.push({ text: text.slice(start, index + 1) });
    start = index + 1;
  }

  if (start < text.length || text.length === 0) {
    lines.push({ text: text.slice(start) });
  }

  return lines;
}

function stripTrailingLineBreak(text: string): string {
  return text.replace(/[\r\n]+$/, "");
}

function throwPreprocessorError(
  message: string,
  fileName: string,
  line: number,
  column: number,
): never {
  throw new Error(formatCompilerError(createPreprocessorError(message, fileName, line, column)));
}
