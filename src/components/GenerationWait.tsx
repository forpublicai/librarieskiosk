import Spinner from '@/components/ui/Spinner';
import { formatElapsed } from '@/hooks/useGenerationProgress';

interface GenerationWaitProps {
    /** What is happening now, e.g. "Rendering fine details…". */
    message: string;
    elapsedSec: number;
    /** How long it usually takes, e.g. "10 to 30 seconds". */
    typical: string;
    /** Extra status line from the provider. */
    detail?: string;
}

/** The spinner with words while a picture, song or clip is being made. */
export default function GenerationWait({ message, elapsedSec, typical, detail }: GenerationWaitProps) {
    return (
        <div className="lk-wait">
            <Spinner label={message} />
            <p className="lk-wait__meta">
                {formatElapsed(elapsedSec)} so far. This usually takes {typical}.
                {detail && <><br />{detail}</>}
            </p>
        </div>
    );
}
