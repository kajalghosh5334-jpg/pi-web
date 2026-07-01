import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Text } from "@earendil-works/pi-tui";
import { existsSync, readFileSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, extname, join } from "path";
import { type Static, Type } from "typebox";
import { getModelsPath } from "../../config.ts";
import { type Theme } from "../../modes/interactive/theme/theme.ts";
import { resolveConfigValue } from "../resolve-config-value.ts";
import type { ToolDefinition } from "../extensions/types.ts";
import { resolveToCwd } from "./path-utils.ts";
import { renderToolPath, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";

const DEFAULT_STEPFUN_BASE_URL = "https://api.stepfun.com/v1";
const DEFAULT_STEPFUN_MODEL = "step-image-edit-2";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const generateImageSchema = Type.Object({
	prompt: Type.String({ description: "Image prompt. Describe the desired image clearly." }),
	provider: Type.Optional(
		Type.String({
			description: "Optional configured provider name. If omitted, Pi selects a configured image-generation model.",
		}),
	),
	outputPath: Type.Optional(
		Type.String({
			description: "Path to write the generated image. Defaults to generated/stepfun-<timestamp>.png.",
		}),
	),
	model: Type.Optional(
		Type.String({
			description: "Optional image model id, or provider/model. If omitted, Pi selects a configured image-generation model.",
		}),
	),
	size: Type.Optional(
		Type.String({
			description:
				"Image size, for example 1024x1024, 768x1360, 896x1184, 1360x768, or 1184x896.",
		}),
	),
	steps: Type.Optional(Type.Number({ description: "Generation steps. StepFun supports 1 to 50." })),
	seed: Type.Optional(Type.Number({ description: "Seed for repeatable generations." })),
	cfgScale: Type.Optional(Type.Number({ description: "Classifier-free guidance scale." })),
	negativePrompt: Type.Optional(Type.String({ description: "Things to avoid in the image." })),
	textMode: Type.Optional(Type.Boolean({ description: "Enable text-scene optimization for step-image-edit-2." })),
});

export type GenerateImageToolInput = Static<typeof generateImageSchema>;

export interface GenerateImageToolDetails {
	path: string;
	model: string;
	size?: string;
	seed?: number;
}

interface ModelsJsonProvider {
	name?: string;
	baseUrl?: string;
	api?: string;
	apiKey?: string;
	headers?: Record<string, string>;
	authHeader?: boolean;
	models?: ModelsJsonModel[];
}

interface ModelsJsonModel {
	id?: string;
	name?: string;
	api?: string;
	baseUrl?: string;
	output?: string[];
	capabilities?: string[];
	routingNotes?: string;
	headers?: Record<string, string>;
}

interface ModelsJsonConfig {
	providers?: Record<string, ModelsJsonProvider>;
}

interface ImageGenerationTarget {
	providerName: string;
	provider: ModelsJsonProvider;
	model: ModelsJsonModel;
	modelId: string;
	api: string;
	baseUrl: string;
	apiKey?: string;
	headers?: Record<string, string>;
	adapter: ImageGenerationAdapter;
}

interface OpenAIImagesResponse {
	data?: Array<{
		b64_json?: string;
		url?: string;
		revised_prompt?: string;
	}>;
	error?: {
		message?: string;
		type?: string;
		code?: string;
	};
}

interface OpenRouterImagesResponse {
	choices?: Array<{
		message?: {
			content?: string;
			images?: Array<{
				image_url?: string | { url?: string };
			}>;
		};
	}>;
	error?: {
		message?: string;
	};
}

interface GeminiInteractionResponse {
	output_image?: {
		data?: string;
		mime_type?: string;
	};
	error?: {
		message?: string;
	};
}

interface ImageGenerationResult {
	image: Buffer;
	model: string;
	revisedPrompt?: string;
}

interface ImageGenerationAdapter {
	id: string;
	canHandle(target: ImageGenerationTarget): boolean;
	generate(input: GenerateImageToolInput, target: ImageGenerationTarget, signal?: AbortSignal): Promise<ImageGenerationResult>;
}

function readModelsConfig(): ModelsJsonConfig {
	const modelsPath = getModelsPath();
	if (existsSync(modelsPath)) {
		try {
			return JSON.parse(readFileSync(modelsPath, "utf-8")) as ModelsJsonConfig;
		} catch {
			return {};
		}
	}
	return {};
}

function resolveConfigRecord(record?: Record<string, string>): Record<string, string> | undefined {
	if (!record) return undefined;
	const resolved: Record<string, string> = {};
	for (const [key, value] of Object.entries(record)) {
		const next = resolveConfigValue(value);
		if (next !== undefined) resolved[key] = next;
	}
	return Object.keys(resolved).length ? resolved : undefined;
}

function resolveProviderApiKey(providerName: string, provider: ModelsJsonProvider): string | undefined {
	const configured = provider.apiKey ? resolveConfigValue(provider.apiKey) : undefined;
	if (configured) return configured;
	if (providerName === "stepfun") return process.env.STEP_API_KEY || process.env.STEPFUN_API_KEY;
	if (/^(google|gemini|google-vertex)$/i.test(providerName)) return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
	if (providerName === "openai") return process.env.OPENAI_API_KEY;
	if (providerName === "openrouter") return process.env.OPENROUTER_API_KEY;
	return undefined;
}

function hasImageGenerationCapability(model: ModelsJsonModel): boolean {
	const text = `${model.id || ""} ${model.name || ""} ${model.routingNotes || ""}`.toLowerCase();
	return (
		model.output?.includes("image") === true ||
		model.capabilities?.includes("image-generation") === true ||
		/image|imagen|dall|gpt-image|nano.?banana|gemini.*image|step-image|step-1x|flux|sdxl/.test(text)
	);
}

function normalizeBaseUrl(providerName: string, provider: ModelsJsonProvider, model: ModelsJsonModel): string {
	const configured = (model.baseUrl || provider.baseUrl || "").replace(/\/+$/, "");
	if (providerName === "stepfun" && configured.includes("/step_plan/")) return DEFAULT_STEPFUN_BASE_URL;
	if (/^(google|gemini)$/i.test(providerName) && !configured) return DEFAULT_GEMINI_BASE_URL;
	return configured;
}

function targetKey(target: ImageGenerationTarget): string {
	return `${target.providerName}/${target.modelId}`;
}

function parseRequestedModel(input: GenerateImageToolInput): { providerName?: string; modelId?: string } {
	const model = input.model?.trim();
	if (model?.includes("/")) {
		const [providerName, ...rest] = model.split("/");
		return { providerName, modelId: rest.join("/") };
	}
	return { providerName: input.provider?.trim(), modelId: model || undefined };
}

function buildTargets(input: GenerateImageToolInput): ImageGenerationTarget[] {
	const config = readModelsConfig();
	const providers = config.providers ?? {};
	const requested = parseRequestedModel(input);
	const targets: ImageGenerationTarget[] = [];

	for (const [providerName, provider] of Object.entries(providers)) {
		if (requested.providerName && providerName !== requested.providerName) continue;
		for (const model of provider.models ?? []) {
			if (!model.id) continue;
			if (requested.modelId && model.id !== requested.modelId) continue;
			if (!requested.modelId && !hasImageGenerationCapability(model)) continue;

			const baseUrl = normalizeBaseUrl(providerName, provider, model);
			const api = model.api || provider.api || "";
			const targetBase = {
				providerName,
				provider,
				model,
				modelId: model.id,
				api,
				baseUrl,
				apiKey: resolveProviderApiKey(providerName, provider),
				headers: {
					...resolveConfigRecord(provider.headers),
					...resolveConfigRecord(model.headers),
				},
			};
			const adapter = imageGenerationAdapters.find((candidate) => candidate.canHandle(targetBase as ImageGenerationTarget));
			if (adapter) targets.push({ ...targetBase, adapter });
		}
	}

	if (!targets.length && !requested.providerName && !requested.modelId) {
		const provider = providers.stepfun;
		if (provider) {
			const model: ModelsJsonModel = { id: DEFAULT_STEPFUN_MODEL, output: ["image"] };
			const targetBase = {
				providerName: "stepfun",
				provider,
				model,
				modelId: DEFAULT_STEPFUN_MODEL,
				api: provider.api || "openai-completions",
				baseUrl: normalizeBaseUrl("stepfun", provider, model),
				apiKey: resolveProviderApiKey("stepfun", provider),
				headers: resolveConfigRecord(provider.headers),
			};
			const adapter = imageGenerationAdapters.find((candidate) => candidate.canHandle(targetBase as ImageGenerationTarget));
			if (adapter) targets.push({ ...targetBase, adapter });
		}
	}

	return targets;
}

function resolveTarget(input: GenerateImageToolInput): ImageGenerationTarget {
	const targets = buildTargets(input);
	if (!targets.length) {
		throw new Error(
			"No configured image-generation model found. Add a model with output: [\"image\"] or capability image-generation in Models.",
		);
	}
	const withKey = targets.find((target) => target.apiKey || target.adapter.id === "gemini-interactions");
	return withKey || targets[0];
}

function defaultOutputPath(target?: ImageGenerationTarget): string {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return join("generated", `${target?.providerName || "image"}-${stamp}.png`);
}

function ensurePngPath(path: string): string {
	return extname(path) ? path : `${path}.png`;
}

async function fetchImageData(url: string, signal?: AbortSignal): Promise<Buffer> {
	const response = await fetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Failed to download generated image: HTTP ${response.status}`);
	}
	return Buffer.from(await response.arrayBuffer());
}

function authHeaders(target: ImageGenerationTarget): Record<string, string> {
	const headers = { ...(target.headers ?? {}) };
	if (target.apiKey && target.provider.authHeader !== false && !headers.Authorization && !headers.authorization) {
		headers.Authorization = `Bearer ${target.apiKey}`;
	}
	return headers;
}

async function parseOpenAIImageResponse(response: Response, signal?: AbortSignal): Promise<Buffer> {
	const text = await response.text();
	let payload: OpenAIImagesResponse;
	try {
		payload = JSON.parse(text) as OpenAIImagesResponse;
	} catch {
		throw new Error(text || `Image generation failed: HTTP ${response.status}`);
	}

	if (!response.ok) {
		throw new Error(payload.error?.message || `Image generation failed: HTTP ${response.status}`);
	}

	const item = payload.data?.[0];
	if (!item) throw new Error("Provider returned no image data.");
	if (item.b64_json) return Buffer.from(item.b64_json, "base64");
	if (item.url) return fetchImageData(item.url, signal);
	throw new Error("Provider returned an unsupported image response.");
}

async function callOpenAIImages(
	input: GenerateImageToolInput,
	target: ImageGenerationTarget,
	signal?: AbortSignal,
): Promise<ImageGenerationResult> {
	if (!target.apiKey) throw new Error(`No API key configured for ${target.providerName}.`);

	const body: Record<string, unknown> = {
		model: target.modelId,
		prompt: input.prompt,
		response_format: "b64_json",
		size: input.size || "1024x1024",
	};
	if (input.steps !== undefined) body.steps = input.steps;
	if (input.seed !== undefined) body.seed = input.seed;
	if (input.cfgScale !== undefined) body.cfg_scale = input.cfgScale;
	if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
	if (input.textMode !== undefined) body.text_mode = input.textMode;

	const response = await fetch(`${target.baseUrl}/images/generations`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...authHeaders(target),
		},
		body: JSON.stringify(body),
		signal,
	});
	return { image: await parseOpenAIImageResponse(response, signal), model: targetKey(target) };
}

function extractDataUrlImage(url: string): Buffer | undefined {
	const match = url.match(/^data:[^;]+;base64,(.+)$/);
	return match ? Buffer.from(match[1], "base64") : undefined;
}

async function callOpenRouterImages(
	input: GenerateImageToolInput,
	target: ImageGenerationTarget,
	signal?: AbortSignal,
): Promise<ImageGenerationResult> {
	if (!target.apiKey) throw new Error(`No API key configured for ${target.providerName}.`);
	const response = await fetch(`${target.baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...authHeaders(target),
		},
		body: JSON.stringify({
			model: target.modelId,
			messages: [{ role: "user", content: [{ type: "text", text: input.prompt }] }],
			modalities: ["image"],
		}),
		signal,
	});
	const text = await response.text();
	let payload: OpenRouterImagesResponse;
	try {
		payload = JSON.parse(text) as OpenRouterImagesResponse;
	} catch {
		throw new Error(text || `OpenRouter image generation failed: HTTP ${response.status}`);
	}
	if (!response.ok) throw new Error(payload.error?.message || `OpenRouter image generation failed: HTTP ${response.status}`);
	for (const image of payload.choices?.[0]?.message?.images ?? []) {
		const imageUrl = typeof image.image_url === "string" ? image.image_url : image.image_url?.url;
		if (!imageUrl) continue;
		const dataImage = extractDataUrlImage(imageUrl);
		if (dataImage) return { image: dataImage, model: targetKey(target) };
		return { image: await fetchImageData(imageUrl, signal), model: targetKey(target) };
	}
	throw new Error("OpenRouter returned no image data.");
}

async function callGeminiInteractions(
	input: GenerateImageToolInput,
	target: ImageGenerationTarget,
	signal?: AbortSignal,
): Promise<ImageGenerationResult> {
	if (!target.apiKey) throw new Error(`No API key configured for ${target.providerName}.`);
	const baseUrl = target.baseUrl || DEFAULT_GEMINI_BASE_URL;
	const response = await fetch(`${baseUrl}/interactions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-goog-api-key": target.apiKey,
			...(target.headers ?? {}),
		},
		body: JSON.stringify({
			model: target.modelId,
			input: [{ type: "text", text: input.prompt }],
		}),
		signal,
	});
	const text = await response.text();
	let payload: GeminiInteractionResponse;
	try {
		payload = JSON.parse(text) as GeminiInteractionResponse;
	} catch {
		throw new Error(text || `Gemini image generation failed: HTTP ${response.status}`);
	}
	if (!response.ok) throw new Error(payload.error?.message || `Gemini image generation failed: HTTP ${response.status}`);
	if (!payload.output_image?.data) throw new Error("Gemini returned no image data.");
	return { image: Buffer.from(payload.output_image.data, "base64"), model: targetKey(target) };
}

const imageGenerationAdapters: ImageGenerationAdapter[] = [
	{
		id: "gemini-interactions",
		canHandle: (target) =>
			/^(google|gemini)$/i.test(target.providerName) ||
			target.api === "google-generative-ai" ||
			/gemini.*image|nano.?banana/.test(`${target.modelId} ${target.model.name || ""}`.toLowerCase()),
		generate: callGeminiInteractions,
	},
	{
		id: "openrouter-chat-images",
		canHandle: (target) => target.providerName === "openrouter" || target.baseUrl.includes("openrouter.ai"),
		generate: callOpenRouterImages,
	},
	{
		id: "openai-images",
		canHandle: (target) => Boolean(target.baseUrl),
		generate: callOpenAIImages,
	},
];

function formatCall(args: GenerateImageToolInput | undefined, theme: Theme, cwd: string): string {
	const outputPath = str(args?.outputPath) || "generated/stepfun-<timestamp>.png";
	const pathDisplay = renderToolPath(outputPath, theme, cwd);
	const prompt = str(args?.prompt);
	return `${theme.fg("toolTitle", theme.bold("generate_image"))} ${pathDisplay}${prompt ? `\n${theme.fg("toolOutput", prompt)}` : ""}`;
}

export function createGenerateImageToolDefinition(
	cwd: string,
): ToolDefinition<typeof generateImageSchema, GenerateImageToolDetails | undefined> {
	return {
		name: "generate_image",
		label: "generate_image",
		description:
			"Generate an image with a configured image provider and save it as a local PNG file. Use this when the user asks to draw, create, generate, or render an image.",
		promptSnippet: "Generate images",
		promptGuidelines: [
			"Use generate_image for image creation requests instead of writing provider-specific scripts.",
			"If the user does not specify a provider/model, use the configured image-generation model automatically.",
			"After generating an image, report the saved file path to the user.",
		],
		parameters: generateImageSchema,
		async execute(_toolCallId, input: GenerateImageToolInput, signal?: AbortSignal) {
			const target = resolveTarget(input);
			const relativeOutputPath = ensurePngPath(input.outputPath?.trim() || defaultOutputPath(target));
			const absoluteOutputPath = resolveToCwd(relativeOutputPath, cwd);
			const result = await target.adapter.generate(input, target, signal);
			await mkdir(dirname(absoluteOutputPath), { recursive: true });
			await writeFile(absoluteOutputPath, result.image);
			return {
				content: [
					{
						type: "text",
						text: `Generated image saved to ${absoluteOutputPath}`,
					},
					{
						type: "image",
						mimeType: "image/png",
						data: result.image.toString("base64"),
					},
				],
				details: {
					path: absoluteOutputPath,
					model: result.model,
					size: input.size,
					seed: input.seed,
				},
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatCall(args as GenerateImageToolInput | undefined, theme, context.cwd));
			return text;
		},
		renderResult(result, _options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			if (context.isError) {
				const output = result.content
					.filter((item) => item.type === "text")
					.map((item) => item.text || "")
					.join("\n");
				text.setText(`\n${theme.fg("error", output)}`);
				return text;
			}
			const path = result.details?.path;
			text.setText(path ? `\n${theme.fg("toolOutput", `saved ${path}`)}` : "");
			return text;
		},
	};
}

export function createGenerateImageTool(cwd: string): AgentTool<typeof generateImageSchema> {
	return wrapToolDefinition(createGenerateImageToolDefinition(cwd));
}
