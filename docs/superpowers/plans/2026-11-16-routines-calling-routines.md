# Routines That Run Other Routines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Run routine** step: a routine runs another routine inline, waits for it, under one run and one Stop.

**Architecture:** A new step kind `{ kind: "ROUTINE"; routineId }` is stored in the existing `Routine.steps` JSON. Saving checks scope, visibility, loops and nesting depth against the stored routines. `RoutineRunner` recurses into called routines under the caller's key, abort signal and `runAs`, loading the called steps when it reaches them. Progress gains a `currentPath`, and problems gain `routineName`. The web editor gets a routine picker; the run views render nested progress and the new problems.

**Tech Stack:** TypeScript, Node, Prisma/Postgres, GraphQL (schema-first, `schema.graphql`), Vitest; React + MUI + Apollo, graphql-codegen.

**Spec:** `docs/superpowers/specs/2026-11-16-routines-calling-routines-design.md`

## Global Constraints

- Branch `feat/routines-calling-routines`, no worktrees. One commit per task, messages ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Small, single-purpose files and components (project rule): new logic goes into new files rather than growing existing ones.
- Nesting limit: **3 routines in a chain** (A → B → C allowed, A → B → C → D rejected). `LIMITS.maxNesting = 3`.
- The 20-step limit applies per routine, not to the expanded total.
- A **shared** routine may call only **shared** routines. A **personal** routine may call its owner's personal routines and the shared routines the owner can see. A routine never calls itself.
- A called routine runs with the caller's `runAs`. Only the top-level routine's last run is stored and published.
- Copy (exact):
  - loop error: `A routine can't run itself (<A> → <B> → <A>)`
  - depth error: `Routines can run other routines only 3 levels deep (<A> → <B> → <C> → <D>)`
  - unusable target: `You can't run <name> from this routine`
  - unknown target: `Unknown routine`
  - editor: `Removed routine`, `Remove the missing routine` (draft error), `Add a device or a routine` (replaces "A routine needs at least one device")
  - reasons (web): `ROUTINE_REMOVED` → `routine removed`, `NESTED_TOO_DEEP` → `too many routines inside each other`
- Server tests: `pnpm --filter @home/server test -- <file>`. Web tests: `pnpm --filter @home/web test -- <file>` (runs codegen first). API tests use `ApiHarness` and need the test database, like the existing `api-routines.test.ts`.

## Review Focus

1. **A called routine is deleted while a caller is mid-run.** The caller records `ROUTINE_REMOVED` at that step and continues. Test in Task 3.
2. **Editing B makes an existing chain too deep or a loop** (A → B exists, then B is edited to call C → D, or to call A). Saving B is rejected, because the check walks the whole graph, callers included. Test in Task 2.
3. **Stop during a wait inside a called routine.** The whole run ends STOPPED and no later step of the caller runs. Test in Task 3.
4. **A user removed from a shared routine's audience** whose personal routine calls it. At run time it's a `NO_ACCESS` problem with no device, not a crash. Test in Task 4.
5. **Old stored runs without `currentPath` or `routineName`.** `toSnapshot` defaults them to `[]` and `null`, and the dashboard still renders. Test in Task 4.

---

### Task 1: Step model and parsing

**Files:**
- Modify: `apps/server/src/routines/steps.ts`
- Test: `apps/server/test/routine-steps.test.ts`

**Interfaces:**
- Produces:
  - `RoutineStep` gains `{ kind: "ROUTINE"; routineId: string }`
  - `StepInput.kind: "SET" | "WAIT" | "ROUTINE"` with `routineId?: string | null`
  - `LIMITS.maxNesting = 3`
  - `stepRoutineIds(steps: RoutineStep[]): string[]` (unique, in order)

- [ ] **Step 1: Write failing tests** in `routine-steps.test.ts`:
  - `parseSteps([{ kind: "ROUTINE", routineId: "r2" }])` returns `[{ kind: "ROUTINE", routineId: "r2" }]`. A routine made only of Run routine steps is valid.
  - A ROUTINE step with a missing or empty `routineId` throws BAD_INPUT `"Pick a routine to run"`.
  - `parseSteps([{ kind: "WAIT", waitMinutes: 5 }])` throws `"Add a device or a routine"`. The old copy `"A routine needs at least one device"` is gone.
  - `stepRoutineIds` returns `["r2", "r3"]` for steps calling r2, r3, r2.
- [ ] **Step 2: Run them:** `pnpm --filter @home/server test -- routine-steps`. Expected: FAIL.
- [ ] **Step 3: Implement** in `steps.ts`. `parseStep` branches on `"ROUTINE"`. The "needs something" check accepts a SET step with actions **or** any ROUTINE step. `stepDeviceIds` ignores ROUTINE steps.
- [ ] **Step 4: Run the server suite:** `pnpm --filter @home/server test`. Expected: PASS. Update `api-routines.test.ts` wherever it asserts the old copy.
- [ ] **Step 5: Commit** `feat(routines): Run routine step kind`.

### Task 2: Save-time call checks and the callable-routines query

**Files:**
- Create: `apps/server/src/routines/calls.ts`
- Modify:
  - `apps/server/src/routines/store.ts` (`validated`)
  - `apps/server/src/graphql/schema.graphql`
  - `apps/server/src/graphql/resolvers/routines.ts`
- Test: `apps/server/test/api-routines.test.ts`, plus a new `apps/server/test/routine-calls.test.ts` for the graph walk

**Interfaces:**
- Consumes: `stepRoutineIds` and `LIMITS.maxNesting` (Task 1); `canSeeRoutine` (`access.ts`)
- Produces:
  - `type CallGraph = Map<string, { name: string; calls: string[] }>`
  - `findCallProblem(graph: CallGraph, maxNesting: number): { kind: "LOOP" | "TOO_DEEP"; names: string[] } | null`: pure; `names` is the offending chain, for the copy
  - `callableRoutines(prisma, checkAs: Pick<User,"id"|"role">, who: { scope: RoutineScope; ownerId: string | null; id?: string }): Promise<{ id: string; name: string }[]>`: by name, excluding `who.id`
  - `checkCalls(prisma, steps: RoutineStep[], checkAs, who: { scope; ownerId; id?; name: string }): Promise<void>`
  - GraphQL: `type RoutineOption { id: ID! name: String! }`; `Query.callableRoutines(scope: RoutineScope!, routineId: ID): [RoutineOption!]!`. With `routineId`, the routine's scope and owner are used (owner as check-as, the same as `updateRoutine`). Without it, the caller is the owner of a new routine.

- [ ] **Step 1: Write failing unit tests** in `routine-calls.test.ts` for `findCallProblem`:
  - A → B → A returns `{ kind: "LOOP", names: ["A","B","A"] }`
  - A → A returns LOOP `["A","A"]`
  - A → B → C returns null
  - A → B → C → D returns `{ kind: "TOO_DEEP", names: ["A","B","C","D"] }`
  - a diamond (A → B, A → C, B → C) returns null
- [ ] **Step 2: Write failing API tests** in `api-routines.test.ts`:
  - Ann's personal routine can call her own personal routine and a shared routine she's in the audience of.
  - It is rejected for Bob's personal routine and for a shared routine she can't see (`"You can't run <name> from this routine"`).
  - A shared routine calling a personal one is rejected.
  - Saving with an unknown id gives `"Unknown routine"`.
  - **Review Focus 2:** create A → B. Updating B to call A is rejected with the loop copy. With B → C → D in place, updating A to call B is rejected with the depth copy.
  - `callableRoutines` returns the allowed set and excludes the routine itself.
- [ ] **Step 3: Run them:** `pnpm --filter @home/server test -- routine-calls api-routines`. Expected: FAIL.
- [ ] **Step 4: Implement `calls.ts`.**
  - Load all routines once (`select id name scope ownerId steps audience`). Households are small, so there's no paging.
  - `checkCalls` checks that every called id exists (`Unknown routine`) and is in `callableRoutines` (`You can't run …`).
  - It then builds the graph with the saved routine's node replaced, or added as `"new"`, using its new steps, and maps `findCallProblem` to BAD_INPUT with the exact copy.
  - `findCallProblem` is a DFS from every node, tracking the current path, and reports the first loop or the first chain longer than `maxNesting`.
  - Call `checkCalls` from `validated` after `checkDevices`. `validated` needs `who.name`: pass the parsed name.
- [ ] **Step 5: Add the query** to the schema and resolver. Refuse guests the same way `createRoutine` does.
- [ ] **Step 6: Run the server suite:** `pnpm --filter @home/server test`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(routines): check calls to other routines when saving`.

### Task 3: Runner recursion

**Files:**
- Modify:
  - `apps/server/src/routines/runner.ts`
  - `apps/server/src/routines/run-outcome.ts`
- Create: `apps/server/src/routines/called-routine.ts` (step-path helpers, if `runner.ts` would pass ~150 lines)
- Test: `apps/server/test/routine-runner.test.ts`

**Interfaces:**
- Consumes: the ROUTINE step (Task 1)
- Produces:
  - `ProblemReason` adds `"ROUTINE_REMOVED" | "NESTED_TOO_DEEP"`
  - `Problem = { step: number; deviceId: string | null; deviceName: string | null; reason: ProblemReason; routineName: string | null }`. `step` is always the top-level index. `routineName` is the called routine the problem came from (the innermost), or null at top level. Routine-level problems have `deviceId`/`deviceName` null.
  - `type PathEntry = { routineName: string; step: number; stepCount: number }`
  - `RunSnapshot.currentPath: PathEntry[]`: empty at top level, one entry per nested routine, innermost last. `waitUntil` belongs to the innermost wait.
  - `RunnerDeps.routine(id: string, runAs: RunAs): Promise<{ name: string; steps: RoutineStep[] } | "NO_ACCESS" | null>`. null means removed.

- [ ] **Step 1: Write failing tests** in `routine-runner.test.ts`. Extend `setup` with a `routines` map and a `deps.routine` stub.
  - Top-level steps `[set lamp, ROUTINE r2]`, r2 = `[wait 5, set tv]`. Commands run lamp then tv, the wait happens inside r2, there's one OK end event, and the event at r2's wait has `currentStep: 1`, `currentPath: [{ routineName: "R2", step: 0, stepCount: 2 }]`.
  - **Review Focus 3:** stopping while waiting inside r2 ends STOPPED, and tv is never set.
  - **Review Focus 1:** a missing r2 records `{ step: 1, reason: "ROUTINE_REMOVED", deviceId: null, deviceName: null, routineName: null }`, and later top-level steps still run (PARTIAL).
  - `"NO_ACCESS"` from deps records reason NO_ACCESS with null device fields.
  - A device problem inside r2 carries `routineName: "R2"` and `step: 1`.
  - Chain r1 → r2 → r3 → r4: the step in r3 that calls r4 records `NESTED_TOO_DEEP` with `routineName: "R3"`, and r4 never loads.
  - `runAs` is passed unchanged to `deps.routine` and to `canAccess` inside r2.
- [ ] **Step 2: Run them:** `pnpm --filter @home/server test -- routine-runner`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Split `execute` into a recursive `runSteps(key, run, steps, runAs, path: PathEntry[], depth: number): Promise<"done" | "aborted">`, which returns the action count through a mutable counter on the run.
  - `enterStep` publishes `currentStep = top index` and `currentPath = path`.
  - A routine-level problem adds 1 to the action count, so `outcome` stays correct: removed-only gives FAILED, mixed gives PARTIAL.
  - Depth starts at 1 for the top level. A ROUTINE step at depth `LIMITS.maxNesting` records NESTED_TOO_DEEP.
- [ ] **Step 4: Run the server suite:** `pnpm --filter @home/server test`. Expected: PASS. Fix compile errors in `problem-view.ts`/`run-store.ts` minimally here (null-safe); full handling comes in Task 4.
- [ ] **Step 5: Commit** `feat(routines): run called routines inline`.

### Task 4: Service wiring, storage and API shape

**Files:**
- Create: `apps/server/prisma/migrations/<timestamp>_routine_run_path/migration.sql`. It adds `"currentPath" JSONB NOT NULL DEFAULT '[]'` to `RoutineRun`.
- Modify:
  - `apps/server/prisma/schema.prisma` (`currentPath Json @default("[]")`)
  - `apps/server/src/routines/run-service.ts`
  - `apps/server/src/routines/run-store.ts`
  - `apps/server/src/routines/problem-view.ts`
  - `apps/server/src/graphql/routine-mappers.ts`
  - `apps/server/src/graphql/resolvers/routines.ts`
  - `apps/server/src/graphql/schema.graphql`
- Test: `apps/server/test/api-routine-runs.test.ts`, `apps/server/test/routine-models.test.ts`

**Interfaces:**
- Consumes: `RunnerDeps.routine`, `Problem`, `PathEntry` (Task 3)
- Produces, in GraphQL:
  - `StepKind { SET WAIT ROUTINE }`
  - `RoutineStep` gets `routineId: ID` and `routineName: String`. The name is null when the routine was removed.
  - `RoutineStepInput.routineId: ID`
  - `ProblemReason` gets `ROUTINE_REMOVED NESTED_TOO_DEEP`
  - `RunProblem { step: Int! deviceId: ID deviceName: String reason: ProblemReason! routineName: String }`
  - `type RunPathEntry { routineName: String! step: Int! stepCount: Int! }`
  - `RoutineRun.currentPath: [RunPathEntry!]!`
  - `toApiRoutine(row, viewer, canSee, existing, routineNames: ReadonlyMap<string, string>)`

- [ ] **Step 1: Write failing API tests** in `api-routine-runs.test.ts`:
  - Running A, which calls B, switches B's device and stores one OK last run on A. B's `lastRun` stays null.
  - **Review Focus 4:** Ann's personal routine calls a shared routine. When Ann is removed from its audience, the run records `NO_ACCESS` with `deviceId: null`.
  - Problems with a null `deviceId` are visible to every viewer and not counted in `hiddenProblems`.
  - The `routines` query returns `{ kind: "ROUTINE", routineId, routineName: "B" }`, and `routineName: null` after B is deleted.
  - `tryRoutine` with a ROUTINE step runs the called routine.
- [ ] **Step 2: Write a failing test** in `routine-models.test.ts` (**Review Focus 5**): `toSnapshot` on a row without `currentPath` and problems without `routineName` gives `currentPath: []` and `routineName: null`.
- [ ] **Step 3: Run them:** `pnpm --filter @home/server test -- api-routine-runs routine-models`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - **`RoutineService.routine(id, runAs)`:** load the routine with its audience. Return null if it's missing. Return `"NO_ACCESS"` when `runAs` is set and `canSeeRoutine({ id: runAs.userId, role }, facts)` is false (look up the role).
  - **Storage:** `saveLastRun`, `toSnapshot` and `markInterrupted` handle `currentPath`, resetting it to `[]`.
  - **Visibility:** `viewRun` always shows problems with a null `deviceId`.
  - **Mapping:** the resolver's `toApi` loads the names of all ids from `stepRoutineIds` and passes the map. `toApiStep` maps the ROUTINE step.
- [ ] **Step 5: Run migrations and the server suite:** `pnpm --filter @home/server exec prisma migrate dev --name routine_run_path`, then `pnpm --filter @home/server test`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(routines): expose called routines and nested progress over the API`.

### Task 5: Web draft model

**Files:**
- Modify:
  - `apps/web/src/routines/data/documents.ts`: the fragments add `steps { … routineId routineName }`, `problems { … routineName }` and `currentPath { routineName step stepCount }`
  - `apps/web/src/routines/lib/draft.ts`
  - `apps/web/src/routines/lib/draftOps.ts`
  - `apps/web/src/routines/lib/draftErrors.ts`
  - `apps/web/src/test/routineFixtures.ts`
- Create: `apps/web/src/routines/data/useCallableRoutines.ts`, with the `CALLABLE_ROUTINES` document in `documents.ts`
- Test: `apps/web/src/routines/lib/draft.test.ts`, `draftOps.test.ts`, `draftErrors.test.ts`

**Interfaces:**
- Consumes: the GraphQL shape (Task 4)
- Produces:
  - `DraftStep` adds `{ kind: 'ROUTINE'; routineId: string; routineName: string | null }`. A null name means removed.
  - `addRoutineStep(d: Draft, routine: { id: string; name: string }): Draft`
  - `setStepRoutine(d: Draft, key: string, routine: { id: string; name: string }): Draft`
  - `useCallableRoutines(scope: RoutineScope, routineId: string | null): { routines: { id: string; name: string }[]; loading: boolean }`

- [ ] **Step 1: Write failing tests:**
  - `routineToDraft` keeps a ROUTINE step with its name, or with a null name when removed.
  - `draftToInput` emits `{ kind: 'ROUTINE', routineId }`.
  - `addRoutineStep` appends.
  - `draftErrors` reports `Add a device or a routine` for a wait-only draft, accepts a routine-only draft, and reports `Remove the missing routine` when a step's `routineName` is null.
- [ ] **Step 2: Run them:** `pnpm --filter @home/web test -- draft`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update fixtures so the existing tests compile: `currentPath: []`, `routineName: null`.
- [ ] **Step 4: Run** `pnpm --filter @home/web typecheck && pnpm --filter @home/web test`. Expected: PASS, apart from the TS errors in the components Tasks 6–7 change. Narrow the `switch` statements there with a minimal `ROUTINE` branch rendering the routine name, so the build stays green.
- [ ] **Step 5: Commit** `feat(web): Run routine steps in the draft`.

### Task 6: Editor: add and pick a routine

**Files:**
- Create:
  - `apps/web/src/routines/editor/RoutinePickerDialog.tsx`: a list of `{id,name}` with an empty state ("No other routines to run")
  - `apps/web/src/routines/editor/RoutineStepCard.tsx`: shows the name and a **Change** button; a removed routine shows `Removed routine` in `warning.main`
- Modify:
  - `apps/web/src/routines/editor/StepList.tsx`: a third button, **Add routine** (icon `PlaylistPlayOutlined`), which opens the picker; title `Run routine`
  - `RoutineEditor.tsx`: passes `routineId` and `draft.scope` down so StepList can call `useCallableRoutines`
- Test: `apps/web/src/routines/editor/StepList.test.tsx`

**Interfaces:**
- Consumes: `addRoutineStep`, `setStepRoutine`, `useCallableRoutines` (Task 5)

- [ ] **Step 1: Write failing tests:**
  - Clicking "Add routine" opens the picker, lists the mocked callable routines, and picking "Lock up" adds a step titled "Run routine" showing "Lock up".
  - "Change" swaps the routine.
  - A removed-routine step shows "Removed routine".
  - The picker shows the empty state when the list is empty.
- [ ] **Step 2: Run them:** `pnpm --filter @home/web test -- StepList`. Expected: FAIL.
- [ ] **Step 3: Implement**, following `DevicePickerDialog.tsx`'s structure.
- [ ] **Step 4: Run** `pnpm --filter @home/web test && pnpm --filter @home/web lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): add Run routine steps in the editor`.

### Task 7: Run views

**Files:**
- Modify:
  - `apps/web/src/routines/lib/runProgress.ts`
  - `apps/web/src/routines/lib/runLabel.ts`
  - `apps/web/src/routines/lib/describeAction.ts` (if it names step kinds)
  - `apps/web/src/routines/list/StepDetail.tsx`
  - `apps/web/src/routines/list/RunDetailsDialog.tsx`
- Test: `runProgress.test.ts`, `runLabel.test.ts`, `RunDetailsDialog.test.tsx`

**Interfaces:**
- Consumes: `currentPath`, `routineName` and the new reasons (Task 4)
- Produces: `problemText(p: { deviceName: string | null; reason; routineName: string | null }): string`

- [ ] **Step 1: Write failing tests:**
  - `stepProgress` for a run at top step 2 of 3 with `currentPath [{ routineName: 'Lock up', step: 1, stepCount: 4 }]` and a `waitUntil`: label `Step 3 of 3 · Lock up › step 2 of 4 · Waiting · 12 min left`.
  - Without `waitUntil`: `… › step 2 of 4 · Running…`.
  - A top-level ROUTINE step with an empty path: `Step 3 of 3 · Running Lock up…`.
  - `problemText`:
    - `{deviceName:'Lamp', reason:'UNREACHABLE', routineName:'Lock up'}` gives `Lock up › Lamp: couldn't reach it`
    - `{deviceName:null, reason:'ROUTINE_REMOVED', routineName:null}` gives `Routine: routine removed`
    - `NESTED_TOO_DEEP` gives `too many routines inside each other`
  - `RunDetailsDialog`: a ROUTINE step shows `Run Lock up` and lists its problems under it with a ⚠.
- [ ] **Step 2: Run them:** `pnpm --filter @home/web test -- runProgress runLabel RunDetailsDialog`. Expected: FAIL.
- [ ] **Step 3: Implement.** `StepDetail` gets a ROUTINE branch: the title `Run <name>` (or `Removed routine`), then the problems with `p.step === index`, via `problemText`.
- [ ] **Step 4: Run** `pnpm --filter @home/web typecheck && pnpm --filter @home/web test && pnpm --filter @home/server test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): show called routines in run progress and details`.
