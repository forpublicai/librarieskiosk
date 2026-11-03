import InfoHeader from '@/components/InfoHeader';
import ToolShape, { type ToolName } from '@/components/ui/ToolShape';
import { formatModeCost } from '@/lib/creditCosts';

const TOOLS: { tool: ToolName; title: string; description: string }[] = [
    { tool: 'chat', title: 'Chat', description: 'Ask a question, get help writing, or plan something.' },
    { tool: 'image', title: 'Image', description: 'Describe a picture. The AI draws it.' },
    { tool: 'music', title: 'Music', description: 'Describe a style or a mood. The AI makes a short song.' },
    { tool: 'video', title: 'Video', description: 'Describe a scene. The AI makes a short clip. No camera needed.' },
    { tool: 'code', title: 'Code', description: 'Write, fix or learn code in any language. No experience needed.' },
];

const STEPS = [
    {
        title: 'Create an account',
        body: 'On the sign-in screen, choose Create an account. Pick a username and a password.',
    },
    {
        title: 'Ask a librarian to approve it',
        body: 'Tell a librarian that you signed up. They can usually approve your account while you wait.',
    },
    {
        title: 'Sign in and pick a tool',
        body: 'Sign in and choose a tool on the Home screen. Next time, sign in to pick up where you left off.',
    },
];

export default function GettingStartedPage() {
    return (
        <div className="lk-info">
            <InfoHeader current="/getting-started" />

            <main className="lk-page">
                <div>
                    <h1 className="lk-title">Welcome to the Public AI kiosk</h1>
                    <p className="lk-lead">
                        This kiosk gives you free AI tools, right here at your library. You do not need any
                        experience. Sign in, or try it as a guest.
                    </p>
                </div>

                <section className="lk-info__section" aria-labelledby="tools">
                    <h2 id="tools" className="lk-heading">What you can do</h2>
                    <ul className="lk-rows">
                        {TOOLS.map((t) => (
                            <li key={t.tool} className="lk-row lk-row--start">
                                <ToolShape tool={t.tool} size={48} />
                                <div className="lk-row__text">
                                    <p className="lk-row__title">{t.title}</p>
                                    <p className="lk-row__body">{t.description}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="lk-info__section" aria-labelledby="accounts">
                    <h2 id="accounts" className="lk-heading">Two ways to use the kiosk</h2>
                    <ul className="lk-rows">
                        <li className="lk-row">
                            <div className="lk-row__text">
                                <p className="lk-row__title">Your own account (best)</p>
                                <p className="lk-row__body">
                                    Create an account and ask a librarian to approve it. Your chats and
                                    everything you make are saved for your next visit. You get <strong>100 credits</strong> that
                                    renew every week.
                                </p>
                            </div>
                        </li>
                        <li className="lk-row">
                            <div className="lk-row__text">
                                <p className="lk-row__title">Guest session</p>
                                <p className="lk-row__body">
                                    No sign-up needed. Choose Continue as guest on the sign-in screen. You get
                                    {' '}<strong>100 credits</strong> to try every tool, but nothing is saved when you leave.
                                </p>
                            </div>
                        </li>
                    </ul>
                </section>

                <section className="lk-info__section" aria-labelledby="steps">
                    <h2 id="steps" className="lk-heading">How to start</h2>
                    <ol className="lk-rows">
                        {STEPS.map((s, i) => (
                            <li key={s.title} className="lk-row lk-row--start">
                                <span className="lk-step-num" aria-hidden="true">{i + 1}</span>
                                <div className="lk-row__text">
                                    <p className="lk-row__title">{s.title}</p>
                                    <p className="lk-row__body">{s.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className="lk-info__section" aria-labelledby="credits">
                    <h2 id="credits" className="lk-heading">Credits</h2>
                    <div className="lk-stats">
                        <div className="lk-stat">
                            <span className="lk-stat__value">100</span>
                            <span className="lk-stat__label">Credits each week</span>
                        </div>
                        <div className="lk-stat">
                            <span className="lk-stat__value">Monday</span>
                            <span className="lk-stat__label">Credits renew at midnight</span>
                        </div>
                        <div className="lk-stat">
                            <span className="lk-stat__value">Free</span>
                            <span className="lk-stat__label">Cost to you</span>
                        </div>
                    </div>
                    <p>
                        Each tool uses a set number of credits. If you need more to finish a project, ask a
                        librarian. They can give you more from the library&apos;s credits.
                    </p>
                    <div className="lk-table-wrap">
                        <table className="lk-table">
                            <thead>
                                <tr>
                                    <th scope="col">Tool</th>
                                    <th scope="col">Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {TOOLS.map((t) => (
                                    <tr key={t.tool}>
                                        <th scope="row" className="lk-table__name">{t.title}</th>
                                        <td>{formatModeCost(t.tool)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
}
