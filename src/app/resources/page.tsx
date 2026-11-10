import InfoHeader from '@/components/InfoHeader';
import { ButtonLink } from '@/components/ui/Button';

export default function ResourcesPage() {
    return (
        <div className="lk-info">
            <InfoHeader current="/resources" />

            <main className="lk-page">
                <h1 className="lk-title">Resources</h1>
                <p className="lk-lead">We are still putting this page together. Please check back soon.</p>
                <div className="lk-home__actions">
                    <ButtonLink variant="secondary" icon="help" href="/getting-started">Read how to get started</ButtonLink>
                    <ButtonLink variant="quiet" href="/faqs">See the FAQs</ButtonLink>
                </div>
            </main>
        </div>
    );
}
