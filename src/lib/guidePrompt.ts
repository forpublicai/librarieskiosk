import 'server-only';

import { TIER_LABELS, type GuideTier } from '@/lib/guideConstants';

export const ALLOWED_GUIDE_TOOLS = ['chat', 'code', 'image', 'video', 'music'] as const;
export type GuideTool = (typeof ALLOWED_GUIDE_TOOLS)[number];

export function isGuideTool(tool: unknown): tool is GuideTool {
    return (
        typeof tool === 'string' &&
        (ALLOWED_GUIDE_TOOLS as readonly string[]).includes(tool)
    );
}

const TOOL_DESCRIPTIONS: Record<GuideTool, string> = {
    chat: 'Chat tool - a conversational AI assistant that helps with writing, research, planning, and thinking through problems',
    code: 'Code Assistant tool - an AI tool for writing, debugging, and explaining code',
    image: 'Image Generator tool - an AI tool that creates images from text descriptions',
    video: 'Video Generator tool - an AI tool that creates short video clips from text descriptions',
    music: 'Music Generator tool - an AI tool that composes original music from style and mood descriptions',
};

// What counts as "in scope" for each tool's learning guide. Intentionally broad:
// patrons benefit from adjacent concepts, not just UI-level instructions.
const TOOL_TOPIC_SCOPE: Record<GuideTool, string> = {
    chat: 'this chat tool, conversational AI, writing and language, prompting techniques, and general AI concepts that come up when using a chat assistant',
    code: 'this code tool, programming and software concepts, debugging, languages and frameworks, file formats, and ideas that come up when writing or running code',
    image: 'this image tool, AI image generation, image formats (JPEG, PNG, AVIF, SVG, etc.), art styles and visual composition, lighting and mood, and prompting techniques for images',
    video: 'this video tool, AI video generation, video formats (MP4, WebM, etc.), cinematic and motion concepts, scene composition, pacing, and prompting techniques for video',
    music: 'this music tool, AI music generation, audio formats (MP3, WAV, OGG, etc.), music theory basics, genres and instruments, lyrics, mood, and prompting techniques for music',
};

const TIER_GUIDANCE: Record<GuideTier, string> = {
    1: 'Use plain, everyday language with no jargon whatsoever. Use relatable, real-world analogies. Keep responses short and encouraging. If you must use a technical term, define it immediately in simple words.',
    2: 'You can use general technology terms, but explain AI-specific concepts clearly when you introduce them. Assume comfort with basic computer tasks but not with AI workflows.',
    3: 'You can use AI and technology terminology freely. Focus on nuance, effective prompting strategies, known limitations to watch for, and techniques for getting the best results.',
};

// wordLimit is communicated to the model; maxTokens is enforced by NanoGPT.
export const TIER_CAPS: Record<GuideTier, { wordLimit: number; maxTokens: number }> = {
    1: { wordLimit: 80, maxTokens: 110 },
    2: { wordLimit: 60, maxTokens: 85 },
    3: { wordLimit: 50, maxTokens: 70 },
};

export function buildGuideSystemPrompt(tool: GuideTool, tier: GuideTier): string {
    const toolDesc = TOOL_DESCRIPTIONS[tool];
    const tierLabel = TIER_LABELS[tier];
    const tierGuidance = TIER_GUIDANCE[tier];
    const cap = TIER_CAPS[tier];
    const toolName = toolDesc.split(' -')[0];
    const scope = TOOL_TOPIC_SCOPE[tool];

    return `You are a specialist learning guide for the ${toolDesc} in a public library AI kiosk.

The user has described their experience level as: "${tierLabel}"

Tailor every response to this level: ${tierGuidance}

You may answer questions about: ${scope}.

Do not refuse questions that are tangentially related - file formats, terminology, underlying concepts, and prompting techniques are all in scope. Only redirect when a question is clearly outside this scope (e.g., weather, taxes, personal advice, or content meant for a different kiosk tool). When redirecting, briefly say you are here to help with the ${toolName} and offer to answer a related question instead.

Keep your response under ${cap.wordLimit} words. Write in short paragraphs separated by blank lines.`;
}
