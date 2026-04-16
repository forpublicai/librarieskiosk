'use client';

import { useState } from 'react';

interface FAQItem {
  q: string;
  a: string;
}

const PATRON_FAQS: FAQItem[] = [
  {
    q: 'What is Public AI for Libraries?',
    a: 'Public AI for Libraries is a platform that provides library patrons like you with access to a comprehensive suite of AI-powered tools and services.',
  },
  {
    q: 'Is there a cost to using these services?',
    a: 'As a library patron, you have full access to these premium AI services at no cost.',
  },
  {
    q: 'What AI tools are available?',
    a: 'We provide various AI services including conversational AI, image generation, music creation, video generation, and a coding environment.',
  },
  {
    q: 'Do I need technical expertise to use these tools?',
    a: 'No! Our tools are designed to be user-friendly and accessible to users of all technical levels. Your librarian can help you navigate the initial setup, if needed.',
  },
  {
    q: 'How do I access the services?',
    a: 'Your First Visit: Simply let your librarian know you\'d like to create a personal Public AI account. Once they have authorized your registration, you can log in with your credentials to access the full suite of tools.\n\nReturning Visits: On subsequent visits, you can simply log in to your secure account and pick up exactly where you left off!',
  },
  {
    q: 'Is my data safe?',
    a: 'Yes. Privacy is a core feature of this kiosk. Because you have a dedicated account, your work and history are private to you. We utilize industry-leading Large Language Models (LLMs) that adhere to strict data protection and security standards.',
  },
  {
    q: 'Do you store my conversations or content?',
    a: 'We do not store your private conversations or the content you create. Your data remains within your secure session and is handled according to rigorous privacy protocols.',
  },
  {
    q: 'If I run out of credits and need more to complete my work, what can I do?',
    a: 'Each account comes with a generous allocation of credits. If you find yourself needing more to finish a specific project, please reach out to your librarian for assistance with a credit top-off.',
  },
  {
    q: 'How can I get help if I\'m having issues?',
    a: 'Your librarian is available to provide support for any questions or technical issues you may encounter while using the kiosk.',
  },
];

const ADMIN_FAQS: FAQItem[] = [
  {
    q: 'How much does it cost to implement this in our library?',
    a: 'Each kiosk deployment costs $1,000 per year.',
  },
  {
    q: 'Who can use these services?',
    a: 'Our services are designed for libraries, educational institutions, students, researchers, and educators. We focus on providing equitable access to AI tools.',
  },
  {
    q: 'Do you provide training for library staff?',
    a: 'Yes! We offer onboarding documents and additional resources to help library staff understand and operate the Public AI kiosk.',
  },
  {
    q: 'Can I suggest new features or services?',
    a: 'Absolutely! We welcome feedback and suggestions from our library community. Please reach out to your primary Public AI point of contact with any feedback or requests for new tools.',
  },
  {
    q: 'How can I get help if I\'m having issues?',
    a: 'If the provided onboarding materials do not address your issue, please contact your Public AI representative directly for priority technical support.',
  },
];

function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="faq-item">
          <button
            className="faq-question"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
          >
            <span>{item.q}</span>
            <span className={`faq-chevron${open === i ? ' faq-chevron--open' : ''}`}>▼</span>
          </button>
          {open === i && (
            <p className="faq-answer" style={{ whiteSpace: 'pre-line' }}>{item.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function FAQsPage() {
  return (
    <div className="info-page">
      <header className="info-topbar">
        <a href="/">
          <img src="/images/lib-logo.png" alt="Public AI" className="info-topbar-logo" />
        </a>
        <nav className="info-topbar-nav">
          <a href="/getting-started">Get Started</a>
          <a href="/resources">Resources</a>
          <a href="/faqs" className="active">FAQs</a>
        </nav>
        <a href="/" className="info-topbar-back">← Back to Sign In</a>
      </header>

      <main className="info-content">
        <p className="info-eyebrow">Help Center</p>
        <h1 className="info-title">Frequently Asked<br />Questions</h1>

        <div className="faq-group">
          <p className="faq-group-title">For Patrons</p>
          <FAQAccordion items={PATRON_FAQS} />
        </div>

        <div className="faq-group">
          <p className="faq-group-title">For Admins</p>
          <FAQAccordion items={ADMIN_FAQS} />
        </div>
      </main>
    </div>
  );
}
