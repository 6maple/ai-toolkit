import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { Agent } from '@deepseek-ai/dsh-agent';
import { BrainToolDefinition } from 'brain/public-tools';
export { PUBLIC_BRAIN_TOOLS } from 'brain/public-tools';

interface McpToolInfo {
    name: string;
    description?: string;
    inputSchema?: unknown;
}
interface McpCallResult {
    content: Array<{
        type: string;
        text?: string;
    }>;
    isError?: boolean;
}
/** Trusted host invocation facts forwarded in the MCP request envelope. */
interface McpInvocationMeta {
    threadId?: string;
}
/** Join MCP text content blocks into one string; non-text blocks get placeholders. */
declare function extractText(content: Array<{
    type: string;
    text?: string;
}> | undefined, toolName: string): string;
/** The anchor context is always the first text block; later blocks are warnings. */
declare function extractAnchorContext(content: Array<{
    type: string;
    text?: string;
}> | undefined): string;

/**
 * InstanceManager — one brain process per project root, lazily spawned.
 *
 * - First `brain_*` call for a project root spawns its server (initialize +
 *   tools/list), later calls reuse it.
 * - Unexpected exits mark the instance dead: a 1s cooldown prevents respawn
 *   storms, and >3 restarts within 10s refuse to respawn with a clear error.
 * - dispose() (owned by the plugin's ctx.effect) kills every child.
 *
 * Requests multiplex over one stdio pipe by JSON-RPC id; the server serializes
 * its own writes via withStoreLock, so no client-side queue is needed.
 */

interface InstanceConfig {
    command: string;
    args: readonly string[];
    timeoutMs: number;
    home: string;
}
declare class InstanceManager {
    private readonly config;
    private readonly instances;
    private disposed;
    constructor(config: InstanceConfig);
    /** Tools advertised by the live server for a project root (spawning on demand). */
    tools(projectRoot: string): Promise<Map<string, McpToolInfo>>;
    /** Forward one tool call to the instance owning the project root. */
    call(projectRoot: string, name: string, args: unknown, signal?: AbortSignal, meta?: McpInvocationMeta): Promise<McpCallResult>;
    /** Kill every managed server. Idempotent; safe to call twice. */
    dispose(): void;
    private ensure;
    /** Enforce cooldown and crash-storm limits before respawning a dead instance. */
    private guardRestart;
    private spawnInstance;
}

/**
 * AutoThink — 宿主自动注入：收到用户消息后自动调用 brain_think，把结果作为
 * **消息**注入模型输入（AGENTS.md 同款消息通道，非 contexts 条目）。
 *
 * 为什么是消息通道而不是 contexts：
 * - contexts 条目每次 assemble 都在注入列表里（每次消息刷屏）且快照消息的
 *   source 被 agent-loop 硬编码归因到 dsh-system-prompt；
 * - 消息通道可自定义 source（显示 brain-dsh-plugin）、内容不变不重复注入、
 *   进历史可恢复，与 agent-instructions（AGENTS.md）机制一致。
 *
 * 识别"真正收到用户消息"（已用真实会话数据验证）：
 * - 用户消息在 session 事件流里落盘为 `agent/inbox/spliced` 事件，
 *   `data.inserted[].source.kind === 'user'`（带 rpcId/clientTimeZone 的客户端消息）
 * - steer（用户中途指导）同样触发（新指令刷新记忆）；inject/plugin 注入不触发；
 *   消息被 step 取走的 `removedCount` splice 不触发。
 *
 * 时序（agent-loop 源码确认）：send → splice 落盘 → preStep →
 * inbox.claim → systemPrompt.assemble（本模块触发 think + 缓存）→
 * agent/pre-step（本模块消费缓存并 push 进 messages）→ 落盘 user/message。
 *
 * 去重：仅按**用户消息**去重（同一条消息的多个 step 只注入一次）；
 * 每条新用户消息必定注入（内容相同也输出，think 每次调用推进 tick）。
 */

interface AutoThinkConfig {
    enabled: boolean;
    timeoutMs: number;
}
/** 历史中最后一条本插件注入消息的文本（resume 基线，避免重复注入）。 */
declare function setupAutoThink(ctx: Context, manager: InstanceManager, config: AutoThinkConfig, resolveProjectRoot: (agent: Agent | undefined) => string): () => void;

/**
 * @dsh-external/brain-dsh-plugin — brain 记忆系统 DSH 原生插件。
 *
 * 薄包装：按项目根懒 spawn brain（MCP stdio），把 core 唯一 public
 * contract 注册进 dsh-tools，并转发可信的 DSH session fact。
 *
 * 会话/项目解析（宿主直读，无需 _meta）：
 * - 会话 id：exec.agent.id
 * - 项目根：exec.agent.session.header.cwd（DSH 会话创建时校验写入），
 *   缺失时回退 config.brain.projectRoot
 *
 * 资源注册全部挂 ctx.effect（热重载/卸载自动清理）。
 */

declare const name = "@dsh-external/brain-dsh-plugin";
declare const inject: string[];
interface Config {
    server: {
        command: string;
        args: string[];
        timeoutMs: number;
    };
    brain: {
        /** Fixed project root override; default resolves from the session cwd per call. */
        projectRoot?: string;
        /** Global memory root; default ~/.brain-data. */
        home: string;
    };
    /**
     * 是否把 brain_think 注册给模型（默认开放）。
     * 注意：当 autoThink.enabled 开启（宿主自动注入）时，brain_think 自动对模型隐藏
     * （避免模型重复调用），即实际注册条件 = exposeThink && !autoThink.enabled。
     * DSH 部署下 autoThink 默认开启 → brain_think 默认不开放，由自动注入接管。
     */
    exposeThink: boolean;
    autoThink: {
        /** 收到用户消息后自动调用 brain_think 并注入模型上下文（默认开启）。 */
        enabled: boolean;
        /** 自动注入的单次调用超时（默认 5s；超时静默跳过，不阻塞 step）。 */
        timeoutMs: number;
    };
}
declare const Config: z<Schemastery.ObjectS<{
    server: z<Schemastery.ObjectS<{
        command: z<string, string>;
        args: z<string[], string[]>;
        timeoutMs: z<number, number>;
    }>, Schemastery.ObjectT<{
        command: z<string, string>;
        args: z<string[], string[]>;
        timeoutMs: z<number, number>;
    }>>;
    brain: z<Schemastery.ObjectS<{
        projectRoot: z<string, string>;
        home: z<string, string>;
    }>, Schemastery.ObjectT<{
        projectRoot: z<string, string>;
        home: z<string, string>;
    }>>;
    exposeThink: z<boolean, boolean>;
    autoThink: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        timeoutMs: z<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        timeoutMs: z<number, number>;
    }>>;
}>, Schemastery.ObjectT<{
    server: z<Schemastery.ObjectS<{
        command: z<string, string>;
        args: z<string[], string[]>;
        timeoutMs: z<number, number>;
    }>, Schemastery.ObjectT<{
        command: z<string, string>;
        args: z<string[], string[]>;
        timeoutMs: z<number, number>;
    }>>;
    brain: z<Schemastery.ObjectS<{
        projectRoot: z<string, string>;
        home: z<string, string>;
    }>, Schemastery.ObjectT<{
        projectRoot: z<string, string>;
        home: z<string, string>;
    }>>;
    exposeThink: z<boolean, boolean>;
    autoThink: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        timeoutMs: z<number, number>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        timeoutMs: z<number, number>;
    }>>;
}>>;
/** The hook owns anchor triggering, so it is the only mode that hides think. */
declare function visibleToolDefinitions(autoThinkEnabled: boolean, exposeThink: boolean): readonly BrainToolDefinition[];
/** Per-call project root: session cwd first, config override as fallback. */
declare function resolveProjectRoot(agent: Agent | undefined, config: Config): string;
/**
 * Model args → wire args. brain_think receives the trusted DSH session only
 * when the model did not explicitly choose a session.
 */
declare function buildCallArgs(args: unknown, agent: Agent | undefined, injectable: boolean): Record<string, unknown>;
declare function apply(ctx: Context, config: Config): void;

export { Config, InstanceManager, apply, buildCallArgs, extractAnchorContext, extractText, inject, name, resolveProjectRoot, setupAutoThink, visibleToolDefinitions };
