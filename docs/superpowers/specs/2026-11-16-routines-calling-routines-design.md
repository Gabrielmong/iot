# Routines that run other routines — Design

*Date: 2026-11-16 · Status: awaiting approval · Builds on: [Routines](2026-11-09-routines-design.md) (`apps/server/src/routines/`, `apps/web/src/routines/`)*

## Intent

Routines are made of **Set devices** and **Wait** steps. The user wants a routine to also run another routine, so common sequences are built once and reused. For example, "Good night" could run "Lock up" and then "Bedroom dim" instead of repeating their devices. When "Lock up" is edited, every routine that runs it picks up the change.

## Goals

- A third step type, **Run routine**, which names another routine.
- **The caller waits.** The called routine's steps run inside the caller's run, waits included. The next step starts only when the called routine has finished.
- **One run, one Stop.** Stopping the caller stops whatever it is running, at any depth. The progress display shows which step of the called routine is running.
- **The caller's permissions apply.** A called routine runs with the permissions of the routine that called it:
  - a personal routine runs as its owner, so device grants are checked;
  - a shared routine runs with full access.

  This means a personal routine can't reach devices its owner can't access by calling a shared one.
- **No loops.** Saving fails if the routine would run itself, directly or through others (A → B → A). It also fails if nesting would go deeper than **3 levels**. The runner enforces the same limit as a backstop, in case routines are edited in an order that skips the save check.
- **Removal is safe.** Deleting a routine that others call is allowed. When a caller reaches that step, it records a problem ("routine removed") and carries on with its next step, the same way removed devices are handled now.
- **Try it** works with Run routine steps.

## Non-goals

- Starting a routine in the background and moving on immediately ("fire and forget").
- Passing parameters to a called routine.
- Showing callers on the called routine, or blocking its deletion while others call it.

## Approaches

1. **Run inline, waiting for the called routine (chosen).** The runner expands the step at run time, under the caller's run key. It's simple to stop, the order is predictable, and there's one result per run.
2. **Start the called routine as its own run.** Rejected: the chain can't be stopped as a whole, and `RoutineRunner.start` silently restarts a routine that's already running.
3. **Copy the called routine's steps into the caller when saving.** Rejected: later edits to the called routine wouldn't reach the routines that call it, which defeats the point.

## Design

### Server

- **`steps.ts`:** add `{ kind: "ROUTINE"; routineId: string }`.
  - `parseSteps` accepts the new step. A routine is valid if it has at least one device action **or** one Run routine step.
  - The 20-step limit applies to each routine on its own, not to the expanded total.
- **`store.ts` → `validated`:** check each called routine against the routine being saved.
  - **Exists and visible.** The routine must exist and be visible to the check-as user, i.e. the owner, or the admin for shared routines.
  - **Scope.** A **shared** routine may call only **shared** routines, because its audience may not be able to see someone's personal routine. A personal routine may call its owner's personal routines and the shared routines the owner can see.
  - **Loops and depth.** Walk the graph of stored routines, with the routine being saved replaced by its new steps. Reject a loop with "A routine can't run itself (A → B → A)". Reject nesting deeper than 3 with a similar plain message.
- **`runner.ts`:**
  - Add a dependency `routine(id)` that returns `{ name, steps }`, or null when the routine is missing or can't be seen under `runAs`.
  - `execute` recurses into Run routine steps with the same abort signal and `runAs`, and a depth counter.
  - Action counts and problems from called routines count toward the caller's result (OK / PARTIAL / FAILED).
  - The steps are loaded when the run reaches the Run routine step, so the latest saved version runs.
- **Run progress and problems:**
  - `currentStep` stays the caller's top-level step index. A new `currentPath` adds the chain of called routines and their step indices, so the UI can show "Step 3 · Lock up › step 2". The same goes for `waitUntil`.
  - Problems keep `step` as the caller's top-level index and add `routineName` when the problem happened inside a called routine.
  - A missing called routine records a problem with a new reason, `ROUTINE_REMOVED`. In that case the problem names the routine instead of a device: the device fields become nullable, or a `routineId` is added (builder's call).
- **GraphQL:**
  - `StepKind` gets `ROUTINE`.
  - `RoutineStep` and `RoutineStepInput` get `routineId`. `RoutineStep` also gets `routineName`, which is null once the routine is removed.
  - `RunProblem` and `RoutineRun` get the fields described above.
- **Called routines don't record a run of their own.** Only the caller's last run is updated and published.
- **Unchanged:** the scheduler, and `RoutineRun` storage apart from the new progress fields.

### Web

- **Editor (`StepList` / step cards):** "Add step" gets **Run routine**. It opens a picker listing the routines this routine may call, following the scope rule above, and leaving out the routine itself. The step card shows the routine's name, or "Removed routine" in a warning style.
- **`describeAction`, `runProgress`, `StepDetail` and `RunDetailsDialog`:** render the new step, the nested progress, and the problems that come from called routines.
- **Save errors** (loop, depth, can't see the routine) show through `routineErrorMessage` like the other validation errors.

## Left to the builder

- The exact shape of `currentPath` and of the removed-routine problem.
- Component split in the editor, following the existing one-small-component-per-file style.
- Test coverage across the parser, the store's loop and depth checks, the runner's recursion, stopping and permissions, and the editor.
