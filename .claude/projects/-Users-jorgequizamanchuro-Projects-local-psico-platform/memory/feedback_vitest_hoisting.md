---
name: Vitest mock hoisting pattern
description: How to correctly mock modules with external variable references in Vitest
type: feedback
---

Use `vi.hoisted()` to declare variables that need to be available when `vi.mock()` factory runs. `vi.mock()` calls are hoisted to the top of the file before variable declarations, so closures inside mock factories that reference `const foo = vi.fn()` will capture `undefined`.

**Why:** Vitest hoists `vi.mock()` before imports run, but `const` declarations stay in place. The fix is `vi.hoisted()` which also gets hoisted.

**How to apply:**

```typescript
// Correct pattern
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));
vi.mock("some-module", () => ({
  SomeClass: vi.fn().mockImplementation(() => ({ method: mockFn })),
}));
```

Also prefer direct instantiation (`new Service(mockDep)`) over `Test.createTestingModule()` for services that only need 1-2 dependencies — faster and avoids NestJS DI timing issues.
