/**
 * @dsh-external/dsh-approve-for-me — browser half.
 *
 * Built by tsdown into lib/client.js as a `window.__ModuleLoader__.load({...})` bundle, which
 * is what dsh-client-modules serves and dsh-super-injector's freshness check requires.
 *
 * Two injector-enforced conventions live in THIS file on purpose, because the pre-injection
 * skeleton check greps it:
 *   - `export const inject = ['slots', ...]` must appear literally (a computed array is not
 *     recognized), or apply() cannot use ctx.slots.
 *   - the register() call must carry a literal known slot name; `name: SLOT` with SLOT holding
 *     that same string is rejected as "缺合法 name".
 */
import { Panel, ensureStyles } from "./panel.js";

interface SlotRegistration {
  name: string;
  id: string;
  order?: number;
  inject?: () => Record<string, unknown>;
}

interface SlotsService {
  inject(slot: string, callback: () => unknown): () => void;
  register(
    registration: SlotRegistration,
    component: (props: { readonly sessionId?: unknown }) => unknown,
  ): () => void;
}

interface ClientContext {
  slots: SlotsService;
  effect(callback: () => unknown, label?: string): unknown;
}

export const inject = ["slots", "sessions"];

export function apply(ctx: ClientContext): void {
  // Liveness marker. This line in the browser console, plus the host-side session binding the
  // panel's poll produces, are the two signals that separate "the browser never loaded this
  // module" from "it loaded and then failed".
  console.info("[approve-for-me] client plugin body ran");
  ensureStyles();
  ctx.effect(
    () =>
      ctx.slots.inject("conversation.session.header.utilities", () =>
        ctx.slots.register(
          {
            name: "conversation.session.header.utilities",
            id: "dsh-approve-for-me",
            order: 50,
            inject: () => ({}),
          },
          Panel,
        ),
      ),
    "approve-for-me: session header chip",
  );
}
