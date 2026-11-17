import { describe, expect, it } from "vitest";
import { findCallProblem, type CallGraph } from "../src/routines/calls.js";

const graph = (edges: Record<string, string[]>): CallGraph => new Map(Object.entries(edges).map(([id, calls]) => [id, { name: id, calls }]));

describe("findCallProblem", () => {
  it("finds a loop through another routine", () => {
    expect(findCallProblem(graph({ A: ["B"], B: ["A"] }), 3, "A")).toEqual({ kind: "LOOP", names: ["A", "B", "A"] });
  });
  it("finds a routine that runs itself", () => {
    expect(findCallProblem(graph({ A: ["A"] }), 3, "A")).toEqual({ kind: "LOOP", names: ["A", "A"] });
  });
  it("allows a chain at the limit", () => {
    expect(findCallProblem(graph({ A: ["B"], B: ["C"], C: [] }), 3, "A")).toBeNull();
  });
  it("rejects a chain past the limit", () => {
    expect(findCallProblem(graph({ A: ["B"], B: ["C"], C: ["D"], D: [] }), 3, "A")).toEqual({ kind: "TOO_DEEP", names: ["A", "B", "C", "D"] });
  });
  it("ignores a loop elsewhere that doesn't involve the saved routine", () => {
    expect(findCallProblem(graph({ A: ["B"], B: [], X: ["Y"], Y: ["X"] }), 3, "A")).toBeNull();
  });
  it("allows a diamond", () => {
    expect(findCallProblem(graph({ A: ["B", "C"], B: ["C"], C: [] }), 3, "A")).toBeNull();
  });
});
