'use client';

import { useId, useState } from 'react';
import InfoHeader from '@/components/InfoHeader';
import Icon from '@/components/ui/Icon';

interface FAQItem {
    q: string;
    a: string;
}

const PATRON_FAQS: FAQItem[] = [
    {
        q: 'What is Public AI for Libraries?',
        a: 'Public AI for Libraries gives library patrons like you a set of AI tools to use at the library.',
    },
    {
        q: 'Does it cost anything?',
        a: 'No. As a library patron, you can use every tool for free.',
    },
    {
        q: 'Which AI tools can I use?',
        a: 'Chat, Image, Music, Video and Code. You can talk with an AI, make pictures, songs and short videos, and write code.',
    },
    {
        q: 'Do I need to know about computers or AI?',
        a: 'No. The tools are made for everyone, whatever your experience. A librarian can help you get started if you like.',
    },
    {
        q: 'How do I start?',
        a: 'Your first visit: tell a librarian that you would like your own Public AI account. Once they approve it, sign in to use every tool.\n\nNext visits: sign in to your account and pick up where you left off.',
    },
    {
        q: 'I forgot my password. How do I reset it?',
        a: 'On the sign-in screen, choose Forgot password. Answer the security question you picked when you made your account. Then choose a new password.',
    },
    {
        q: 'Is my data safe?',
        a: 'Yes. Privacy is a core part of this kiosk. Your account keeps your work and history private to you. The AI models we use follow strict data protection and security standards.',
    },
    {
        q: 'Do you keep my conversations or what I make?',
        a: 'We do not keep your private conversations or the things you make. Your data stays in your own session and is handled under strict privacy rules.',
    },
    {
        q: 'I ran out of credits. How do I get more?',
        a: 'Every account gets plenty of credits each week. If you need more to finish a project, ask a librarian. They can give you more.',
    },
    {
        q: 'Where can I get help?',
        a: 'Ask a librarian. They can help with questions or problems while you use the kiosk.',
    },
];

const ADMIN_FAQS: FAQItem[] = [
    {
        q: 'How much does it cost for our library?',
        a: 'Each kiosk costs $1,000 per year.',
    },
    {
        q: 'Who can use it?',
        a: 'It is made for libraries, schools, students, researchers and teachers. Our goal is fair access to AI tools for everyone.',
    },
    {
        q: 'Do you train library staff?',
        a: 'Yes. We give you onboarding documents and other resources so your staff can understand and run the kiosk.',
    },
    {
        q: 'Can I suggest new tools or features?',
        a: 'Yes, please do. Send ideas and requests to your main Public AI contact.',
    },
    {
        q: 'Where can I get help?',
        a: 'If the onboarding documents do not answer your question, contact your Public AI representative for priority support.',
    },
];

function FAQList({ items }: { items: FAQItem[] }) {
    const [open, setOpen] = useState<number | null>(null);
    const baseId = useId();

    return (
        <ul className="lk-rows">
            {items.map((item, i) => {
                const isOpen = open === i;
                const answerId = `${baseId}-a${i}`;
                return (
                    <li key={item.q} className="lk-faq">
                        <h3 className="lk-faq__heading">
                            <button
                                type="button"
                                className="lk-faq__question"
                                onClick={() => setOpen(isOpen ? null : i)}
                                aria-expanded={isOpen}
                                aria-controls={answerId}
                            >
                                <span>{item.q}</span>
                                <Icon name="plus" size={22} className={isOpen ? 'lk-faq__icon lk-faq__icon--open' : 'lk-faq__icon'} />
                            </button>
                        </h3>
                        <div id={answerId} className="lk-faq__answer" hidden={!isOpen}>
                            {item.a}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export default function FAQsPage() {
    return (
        <div className="lk-info">
            <InfoHeader current="/faqs" />

            <main className="lk-page">
                <h1 className="lk-title">Questions and answers</h1>

                <section className="lk-info__section" aria-labelledby="faq-patrons">
                    <h2 id="faq-patrons" className="lk-heading">For patrons</h2>
                    <FAQList items={PATRON_FAQS} />
                </section>

                <section className="lk-info__section" aria-labelledby="faq-admins">
                    <h2 id="faq-admins" className="lk-heading">For library staff</h2>
                    <FAQList items={ADMIN_FAQS} />
                </section>
            </main>
        </div>
    );
}
