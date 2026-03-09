import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { SourceLocation } from "./ast";

export type SourceFile = {
  id: string;
  fileName: string;
  text: string;
  lineStarts: number[];
};

export type SourceManager = {
  loadFile: (filePath: string) => SourceFile;
  addSource: (fileName: string, text: string) => SourceFile;
  getSource: (fileName: string) => SourceFile | undefined;
  resolvePath: (fromFileName: string, target: string) => string;
  getLocation: (fileName: string, offset: number) => SourceLocation;
  getLineText: (fileName: string, line: number) => string;
};

export function createSourceManager(): SourceManager {
  const sources = new Map<string, SourceFile>();

  return {
    loadFile(filePath) {
      const fileName = normalizeFileName(filePath);
      const existing = sources.get(fileName);

      if (existing) {
        return existing;
      }

      const text = readFileSync(fileName, "utf-8");
      return registerSource(sources, fileName, text);
    },
    addSource(fileName, text) {
      return registerSource(sources, normalizeVirtualName(fileName), text);
    },
    getSource(fileName) {
      return sources.get(normalizeMaybeVirtual(fileName));
    },
    resolvePath(fromFileName, target) {
      if (target.startsWith("<")) {
        return normalizeVirtualName(target);
      }

      return normalizeFileName(resolve(dirname(normalizeMaybeVirtual(fromFileName)), target));
    },
    getLocation(fileName, offset) {
      const source = requireSource(sources, fileName);
      return locateOffset(source, offset);
    },
    getLineText(fileName, line) {
      const source = requireSource(sources, fileName);
      const start = source.lineStarts[line - 1] ?? 0;
      const end = source.lineStarts[line] ?? source.text.length;
      return source.text.slice(start, end).replace(/[\r\n]+$/, "");
    },
  };
}

function registerSource(
  sources: Map<string, SourceFile>,
  fileName: string,
  text: string,
): SourceFile {
  const existing = sources.get(fileName);

  if (existing) {
    return existing;
  }

  const source: SourceFile = {
    id: fileName,
    fileName,
    text,
    lineStarts: computeLineStarts(text),
  };

  sources.set(fileName, source);
  return source;
}

function computeLineStarts(text: string): number[] {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }

  return starts;
}

function locateOffset(source: SourceFile, offset: number): SourceLocation {
  const boundedOffset = Math.max(0, Math.min(offset, source.text.length));
  let low = 0;
  let high = source.lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = source.lineStarts[mid];
    const nextStart = source.lineStarts[mid + 1] ?? source.text.length + 1;

    if (boundedOffset < start) {
      high = mid - 1;
      continue;
    }

    if (boundedOffset >= nextStart) {
      low = mid + 1;
      continue;
    }

    return {
      fileName: source.fileName,
      line: mid + 1,
      column: boundedOffset - start + 1,
    };
  }

  return {
    fileName: source.fileName,
    line: 1,
    column: 1,
  };
}

function requireSource(sources: Map<string, SourceFile>, fileName: string): SourceFile {
  const normalized = normalizeMaybeVirtual(fileName);
  const source = sources.get(normalized);

  if (!source) {
    throw new Error(`missing source '${normalized}'`);
  }

  return source;
}

function normalizeFileName(filePath: string): string {
  return resolve(filePath);
}

function normalizeVirtualName(fileName: string): string {
  if (fileName.startsWith("<")) {
    return fileName;
  }

  return resolve(fileName);
}

function normalizeMaybeVirtual(fileName: string): string {
  return fileName.startsWith("<") ? fileName : resolve(fileName);
}
