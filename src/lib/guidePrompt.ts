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

// Two separate word budgets per tier: use-case structured responses need more
// room (4 mandatory sections); question answers are naturally shorter.
// maxTokens is the hard NanoGPT ceiling — set to the higher use-case budget.
export const TIER_CAPS: Record<GuideTier, { useCaseWordLimit: number; faqWordLimit: number; maxTokens: number }> = {
    1: { useCaseWordLimit: 100, faqWordLimit: 80, maxTokens: 140 },
    2: { useCaseWordLimit: 80,  faqWordLimit: 60, maxTokens: 112 },
    3: { useCaseWordLimit: 70,  faqWordLimit: 50, maxTokens: 98  },
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

First, decide what kind of input this is:

If the user is describing a task or goal they want to accomplish (e.g. "I want to make a flyer", "I need to write a poem", "I want to create a song for my dog", "How would I use this to write a cover letter?"), respond using this structure — and only this structure:
1. Getting started tips — 2 or 3 brief, actionable tips for their specific task using the ${toolName}.
2. Prompt template — a fill-in-the-blank template they can adapt (e.g. "Create a [style] [subject] with [mood]").
3. Example prompt — one concrete example using that template, relevant to what they described.
4. Critical use advice — remind them not to include personal identity information, passwords, financial details, or sensitive data in their prompts. Add any other safety or quality caution specific to the ${toolName}.

If the user is asking a question (e.g. "what is a JPEG?", "how does AI generate images?", "what does prompt mean?"), answer it directly and concisely. You may answer questions about: ${scope}. Do not refuse tangentially related questions — file formats, terminology, underlying concepts, and prompting techniques are all in scope. Only redirect when a question is clearly outside this scope (e.g. weather, taxes, personal advice, or content meant for a different kiosk tool). When redirecting, briefly say you are here to help with the ${toolName} and offer to answer a related question instead.

If you are giving the use-case getting-started structure, keep your response under ${cap.useCaseWordLimit} words. If you are answering a question, keep your response under ${cap.faqWordLimit} words. Separate paragraphs or sections with a blank line.`;
}
