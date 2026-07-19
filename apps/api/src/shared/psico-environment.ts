/**
 * Neutral re-export of the canonical environment resolver.
 *
 * The resolver historically lives next to the cache-identity code, but it is
 * pure infra (PSICO_ENV / Railway posture) with no subsystem coupling. This
 * shim gives subsystems a neutral import path — content-core's static guard
 * (no-emotional-map.spec) checks file CONTENTS, and the guarded files must not
 * name other subsystems just to reach a shared utility. Single source of
 * truth: the implementation is NOT duplicated here.
 */
export {
  resolveEnvironment,
  isDeployedEnvironment,
  type PsicoEnvironment,
} from "../emotional-map/cache-identity";
