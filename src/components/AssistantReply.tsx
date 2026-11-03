'use client';

import CopyButton from '@/components/CopyButton';
import ChatMessage from '@/components/ui/ChatMessage';
import Notice from '@/components/ui/Notice';
import { formatAssistantMessage } from '@/lib/formatMessage';

// The chat and code screens store a failed reply as "Error: <detail>".
const ERROR_PREFIX = 'Error: ';

interface AssistantReplyProps {
    content: string;
    /** The page created this reply from a failed request. A real reply that starts with "Error: " stays a reply. */
    failed?: boolean;
    /** The reply is still streaming in: hide the Copy action. */
    streaming?: boolean;
}

/** One AI reply. A failed reply shows as a danger Notice that says what to do next. */
export default function AssistantReply({ content, failed, streaming }: AssistantReplyProps) {
    if (failed) {
        return (
            <Notice tone="danger" title="The AI could not answer">
                Please try again in a moment. If it keeps happening, ask a librarian for help.
                <span className="lk-reply__detail">Details: {content.startsWith(ERROR_PREFIX) ? content.slice(ERROR_PREFIX.length) : content}</span>
            </Notice>
        );
    }

    return (
        <ChatMessage role="assistant" actions={!streaming && <CopyButton text={content} />}>
            <div dangerouslySetInnerHTML={{ __html: formatAssistantMessage(content) }} />
        </ChatMessage>
    );
}
