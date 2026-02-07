/**
 * Grok 模型管理服务
 */

export type Tier = "basic" | "super";
export type Cost = "low" | "high";

export interface ModelInfo {
  grok_model: [string, string];
  rate_limit_model: string;
  display_name: string;
  description: string;
  raw_model_path: string;
  default_temperature: number;
  default_max_output_tokens: number;
  supported_max_output_tokens: number;
  default_top_p: number;
  tier: Tier;
  cost: Cost;
  is_image_model?: boolean;
  is_video_model?: boolean;
}

export const MODEL_CONFIG: Record<string, ModelInfo> = {
  "grok-3": {
    grok_model: ["grok-3", "MODEL_MODE_GROK_3"],
    rate_limit_model: "grok-3",
    display_name: "grok-3",
    description: "Grok 3 chat model",
    raw_model_path: "xai/grok-3",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "low",
  },
  "grok-3-mini": {
    grok_model: ["grok-3", "MODEL_MODE_GROK_3_MINI_THINKING"],
    rate_limit_model: "grok-3",
    display_name: "grok-3-mini",
    description: "Grok 3 Mini thinking model",
    raw_model_path: "xai/grok-3",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "low",
  },
  "grok-3-thinking": {
    grok_model: ["grok-3", "MODEL_MODE_GROK_3_THINKING"],
    rate_limit_model: "grok-3",
    display_name: "grok-3-thinking",
    description: "Grok 3 with thinking mode",
    raw_model_path: "xai/grok-3",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "low",
  },
  "grok-4": {
    grok_model: ["grok-4", "MODEL_MODE_GROK_4"],
    rate_limit_model: "grok-4",
    display_name: "grok-4",
    description: "Grok 4 chat model",
    raw_model_path: "xai/grok-4",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "low",
  },
  "grok-4-mini": {
    grok_model: ["grok-4-mini", "MODEL_MODE_GROK_4_MINI_THINKING"],
    rate_limit_model: "grok-4-mini",
    display_name: "grok-4-mini",
    description: "Grok 4 mini thinking model",
    raw_model_path: "xai/grok-4-mini",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "low",
  },
  "grok-4-thinking": {
    grok_model: ["grok-4", "MODEL_MODE_GROK_4_THINKING"],
    rate_limit_model: "grok-4",
    display_name: "grok-4-thinking",
    description: "Grok 4 with thinking mode",
    raw_model_path: "xai/grok-4",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "low",
  },
  "grok-4-heavy": {
    grok_model: ["grok-4", "MODEL_MODE_HEAVY"],
    rate_limit_model: "grok-4-heavy",
    display_name: "grok-4-heavy",
    description: "Most powerful Grok model (Super tokens required)",
    raw_model_path: "xai/grok-4",
    default_temperature: 1.0,
    default_max_output_tokens: 65536,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "super",
    cost: "high",
  },
  "grok-4.1-mini": {
    grok_model: ["grok-4-1-thinking-1129", "MODEL_MODE_GROK_4_1_MINI_THINKING"],
    rate_limit_model: "grok-4-1-thinking-1129",
    display_name: "grok-4.1-mini",
    description: "Grok 4.1 mini thinking model",
    raw_model_path: "xai/grok-4-1-thinking-1129",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "low",
  },
  "grok-4.1-fast": {
    grok_model: ["grok-4-1-thinking-1129", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-4-1-thinking-1129",
    display_name: "grok-4.1-fast",
    description: "Fast Grok 4.1 chat model",
    raw_model_path: "xai/grok-4-1-thinking-1129",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "low",
  },
  "grok-4.1-expert": {
    grok_model: ["grok-4-1-thinking-1129", "MODEL_MODE_EXPERT"],
    rate_limit_model: "grok-4-1-thinking-1129",
    display_name: "grok-4.1-expert",
    description: "Expert Grok 4.1 chat model",
    raw_model_path: "xai/grok-4-1-thinking-1129",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "high",
  },
  "grok-4.1-thinking": {
    grok_model: ["grok-4-1-thinking-1129", "MODEL_MODE_GROK_4_1_THINKING"],
    rate_limit_model: "grok-4-1-thinking-1129",
    display_name: "grok-4.1-thinking",
    description: "Grok 4.1 with thinking mode",
    raw_model_path: "xai/grok-4-1-thinking-1129",
    default_temperature: 1.0,
    default_max_output_tokens: 32768,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "high",
  },
  "grok-imagine-1.0": {
    grok_model: ["grok-3", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-3",
    display_name: "grok-imagine-1.0",
    description: "Image generation model",
    raw_model_path: "xai/grok-imagine-1.0",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "high",
    is_image_model: true,
  },
  "grok-imagine-1.0-edit": {
    grok_model: ["imagine-image-edit", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-3",
    display_name: "Grok Imagine 1.0 Edit",
    description: "Image edit model",
    raw_model_path: "xai/grok-imagine-1.0-edit",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "high",
    is_image_model: true,
  },
  "grok-imagine-1.0-video": {
    grok_model: ["grok-3", "MODEL_MODE_FAST"],
    rate_limit_model: "grok-3",
    display_name: "grok-imagine-1.0-video",
    description: "Video generation model",
    raw_model_path: "xai/grok-imagine-1.0-video",
    default_temperature: 1.0,
    default_max_output_tokens: 8192,
    supported_max_output_tokens: 131072,
    default_top_p: 0.95,
    tier: "basic",
    cost: "high",
    is_video_model: true,
  },
};

export function isValidModel(model: string): boolean {
  return Boolean(MODEL_CONFIG[model]);
}

export function getModelInfo(model: string): ModelInfo | null {
  return MODEL_CONFIG[model] ?? null;
}

export function toGrokModel(model: string): { grokModel: string; mode: string; isVideoModel: boolean } {
  const cfg = MODEL_CONFIG[model];
  if (!cfg) return { grokModel: model, mode: "MODEL_MODE_FAST", isVideoModel: false };
  return { grokModel: cfg.grok_model[0], mode: cfg.grok_model[1], isVideoModel: Boolean(cfg.is_video_model) };
}

export function toRateLimitModel(model: string): string {
  return MODEL_CONFIG[model]?.rate_limit_model ?? model;
}

/**
 * 根据模型选择 Token 池
 */
export function poolForModel(model: string): string {
  const cfg = MODEL_CONFIG[model];
  if (cfg && cfg.tier === "super") {
    return "ssoSuper";
  }
  return "ssoBasic";
}

/**
 * 按优先级返回可用 Token 池列表
 */
export function poolCandidatesForModel(model: string): string[] {
  const cfg = MODEL_CONFIG[model];
  if (cfg && cfg.tier === "super") {
    return ["ssoSuper"];
  }
  // 基础模型优先使用 basic 池，缺失时可回退到 super 池
  return ["ssoBasic", "ssoSuper"];
}
