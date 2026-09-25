// src/pages/base/Index.tsx
// Mova landing page — port of prototypes/landing.html to React.
import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "@/layout/Header";

/* Scroll-reveal: mirrors theme.js's IntersectionObserver behavior. */
const Reveal: React.FC<{ children?: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className, style }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === "undefined") {
            setVisible(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                entries.forEach((en) => {
                    if (en.isIntersecting) {
                        setVisible(true);
                        io.unobserve(en.target);
                    }
                });
            },
            { threshold: 0.12 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <div ref={ref} className={`reveal ${visible ? "visible" : ""} ${className ?? ""}`} style={style}>
            {children}
        </div>
    );
};

const Index: React.FC = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [openFaq, setOpenFaq] = useState<number | null>(0);
    const location = useLocation();

    /* Deep links like /#faq from the dashboard user menu: the hash-scroll
       happens before this lazy page mounts, so scroll again once rendered. */
    useEffect(() => {
        if (!location.hash) return;
        const el = document.getElementById(location.hash.slice(1));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [location.hash]);

    const faqs: Array<[string, string]> = [
        ["Is my money safe?", "Yes. Funds are held with licensed banking partners, secured with PCI-DSS and bank-grade KYC. Every transfer is encrypted and audited in real time."],
        ["Do you charge fees?", "No monthly fees, and transfers are free. Standard network and withdrawal fees may apply — shown clearly before you confirm any transaction."],
        ["How fast are transfers?", "Most transfers complete in under 250 ms on our rails; bank-network transfers settle within minutes. You'll see live status on every transaction."],
        ["Can I pause a savings goal?", "Yes — pause or resume any goal anytime. Your saved money stays put and keeps its growth rate while paused."],
        ["Do you support teams?", "Yes. Create shared vaults, grant access, and manage expenses together — built for remote teams and joint accounts."],
    ];

    return (
        <>
            <Header />

            <main>
                {/* ================= HERO ================= */}
                <section className="section" style={{ paddingTop: "6rem", paddingBottom: "4rem" }}>
                    <div className="container" style={{ textAlign: "center", maxWidth: "56rem" }}>
                        <Reveal>
                            <span className="eyebrow"><span className="dot" style={{ background: "var(--accent)" }} />&nbsp;Digital banking · Wallets · Savings</span>
                        </Reveal>
                        <Reveal>
                            <h1 className="display" style={{ marginTop: "var(--sp-6)" }}>
                                Your money, moving<br />at the <span className="display-accent">speed of now.</span>
                            </h1>
                        </Reveal>
                        <Reveal>
                            <p className="lead" style={{ margin: "var(--sp-6) auto 0", maxWidth: "44ch" }}>
                                Fund, transfer, save, and track — from one calm, precise dashboard.
                                Free transfers, real-time alerts, and bank-grade security.
                            </p>
                        </Reveal>
                        <Reveal>
                            <div style={{ display: "flex", gap: "var(--sp-3)", justifyContent: "center", marginTop: "var(--sp-8)", flexWrap: "wrap" }}>
                                <Link to="/signup" className="btn btn-primary btn-lg" style={{ textDecoration: "none" }}>Get Started — It's Free</Link>
                                <a href="#features" className="btn btn-secondary btn-lg" style={{ textDecoration: "none" }}>Explore Features</a>
                            </div>
                        </Reveal>
                        <Reveal>
                            <div className="xsmall mono faint" style={{ marginTop: "var(--sp-8)", display: "flex", justifyContent: "center", gap: "var(--sp-8)", flexWrap: "wrap" }}>
                                <span>PCI-DSS</span><span>99.99% uptime</span><span>Bank-grade KYC</span><span>Real-time alerts</span>
                            </div>
                        </Reveal>
                    </div>
                </section>

                {/* product frame */}
                <section className="container" style={{ maxWidth: "58rem" }}>
                    <div className="product-frame">
                        <div className="browser-bar">
                            <span className="dot" /><span className="dot" /><span className="dot" />
                            <span className="url">app.mova.app/dashboard</span>
                        </div>
                        <div style={{ padding: "var(--sp-8)" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-6)", alignItems: "flex-end", justifyContent: "space-between" }}>
                                <div>
                                    <div className="eyebrow"><span className="dot" style={{ background: "var(--success)" }} />&nbsp;Total balance</div>
                                    <div className="money" style={{ fontSize: "2.5rem", fontWeight: 600, letterSpacing: "-0.03em", marginTop: "var(--sp-2)" }}>$82,450.13</div>
                                    <div className="small" style={{ marginTop: "var(--sp-2)" }}><span style={{ color: "var(--success)", fontWeight: 500 }}>+3.1%</span> <span className="faint">this month</span></div>
                                </div>
                                <div style={{ display: "flex", gap: "var(--sp-3)" }}>
                                    <Link to="/dashboard/fund" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Fund Wallet</Link>
                                    <Link to="/dashboard/transfers/new" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>Transfer</Link>
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: "var(--sp-6)", marginTop: "var(--sp-8)" }}>
                                <div className="card card-pad">
                                    <div className="small" style={{ fontWeight: 500, marginBottom: "var(--sp-3)" }}>Recent activity</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between" }} className="small"><span className="subdued">Transfer to Maya Kasim</span><span className="money">-$120.00</span></div>
                                        <hr className="hairline" />
                                        <div style={{ display: "flex", justifyContent: "space-between" }} className="small"><span className="subdued">Wallet Top-Up</span><span className="money" style={{ color: "var(--success)" }}>+$500.00</span></div>
                                        <hr className="hairline" />
                                        <div style={{ display: "flex", justifyContent: "space-between" }} className="small"><span className="subdued">ATM Withdrawal</span><span className="money">-$60.00</span></div>
                                    </div>
                                </div>
                                <div className="card card-pad">
                                    <div className="small" style={{ fontWeight: 500, marginBottom: "var(--sp-3)" }}>Savings Vault</div>
                                    <div className="small"><span className="money" style={{ fontSize: "1.25rem", fontWeight: 600 }}>$24,000</span> <span className="faint">/ $36,000</span></div>
                                    <div className="progress" style={{ marginTop: "var(--sp-3)" }}><div className="progress-fill" style={{ width: "67%" }} /></div>
                                    <div className="xsmall faint" style={{ marginTop: "var(--sp-2)" }}>67% · goal by 31 Dec 2026</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ================= MARQUEE LOGO WALL ================= */}
                <section className="marquee-wrap" style={{ marginTop: "var(--sp-20)" }} aria-label="Trusted by teams">
                    <div className="marquee-track">
                        {[0, 1].map((dup) =>
                            ["Halcyon", "Northwind", "Forma Studio", "Kite & Co", "Plume", "Meridian", "Oak Labs", "Aerion"].map((name, i) => (
                                <span key={`${dup}-${i}`} className="marquee-item">{name}</span>
                            ))
                        )}
                    </div>
                </section>

                {/* ================= HOW IT WORKS ================= */}
                <section className="section" id="how">
                    <div className="container">
                        <Reveal style={{ maxWidth: "34rem", marginBottom: "var(--sp-12)" }}>
                            <span className="eyebrow">How it works</span>
                            <h2 className="h2" style={{ marginTop: "var(--sp-3)" }}>Three moves, that's it.</h2>
                            <p className="lead" style={{ marginTop: "var(--sp-3)" }}>Fund it, move it, watch it grow. No paperwork, no branches, no waiting.</p>
                        </Reveal>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--sp-6)" }}>
                            {[
                                ["01", "Fund your wallet", "Top up instantly by card, bank transfer, or agent cash-in."],
                                ["02", "Send transfers", "Pay anyone, anywhere — free, fast, with bank-grade security."],
                                ["03", "Save on goals", "Automated rules and round-ups build your vault while you sleep."],
                                ["04", "Track everything", "Categorize, budget, and see every expense in real time."],
                            ].map(([num, title, desc]) => (
                                <Reveal key={num}>
                                    <div className="step-num">{num}</div>
                                    <h3 className="h3" style={{ marginTop: "var(--sp-3)" }}>{title}</h3>
                                    <p className="subdued small" style={{ marginTop: "var(--sp-2)", maxWidth: "30ch" }}>{desc}</p>
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ================= FEATURES (tabbed tour) ================= */}
                <section className="section" id="features" style={{ paddingTop: 0 }}>
                    <div className="container">
                        <Reveal style={{ maxWidth: "34rem", marginBottom: "var(--sp-8)" }}>
                            <span className="eyebrow">Everything your money needs</span>
                            <h2 className="h2" style={{ marginTop: "var(--sp-3)" }}>One product. No clutter.</h2>
                            <p className="lead" style={{ marginTop: "var(--sp-3)" }}>Fast. Secure. Minimal. Built for how you actually move money.</p>
                        </Reveal>

                        <div className="tabs">
                            {["Wallet", "Transfers", "Savings", "Insights"].map((label, i) => (
                                <button key={label} type="button" className={`tab ${activeTab === i ? "active" : ""}`} onClick={() => setActiveTab(i)}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        {activeTab === 0 && (
                            <div className="product-frame">
                                <div style={{ padding: "var(--sp-8)", display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: "var(--sp-6)" }}>
                                    <div>
                                        <div className="eyebrow"><span className="dot" style={{ background: "var(--success)" }} />&nbsp;Wallet balance</div>
                                        <div className="money" style={{ fontSize: "2.25rem", fontWeight: 600, letterSpacing: "-0.03em", marginTop: "var(--sp-2)" }}>$82,450.13</div>
                                        <div className="small" style={{ marginTop: "var(--sp-2)" }}><span style={{ color: "var(--success)", fontWeight: 500 }}>+3.1%</span> <span className="faint">this month</span></div>
                                        <div style={{ display: "flex", gap: "var(--sp-3)", marginTop: "var(--sp-6)", flexWrap: "wrap" }}>
                                            <Link to="/dashboard/fund" className="btn btn-primary btn-sm" style={{ textDecoration: "none" }}>Fund Wallet</Link>
                                            <Link to="/dashboard/withdraw" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>Withdraw</Link>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="small" style={{ fontWeight: 500, marginBottom: "var(--sp-3)" }}>Available</div>
                                        <div className="money small">$81,920.50</div>
                                        <div className="small" style={{ fontWeight: 500, margin: "var(--sp-6) 0 var(--sp-3)" }}>Wallet ID</div>
                                        <div className="mono xsmall subdued">mva_wlt_8f2kq4a7</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 1 && (
                            <div className="product-frame">
                                <div style={{ padding: "var(--sp-8)", display: "grid", gridTemplateColumns: "minmax(0,5fr) minmax(0,7fr)", gap: "var(--sp-8)" }}>
                                    <div>
                                        <div className="small" style={{ fontWeight: 500, marginBottom: "var(--sp-3)" }}>Recent transfers</div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between" }} className="small"><span className="subdued">Maya Kasim</span><span className="money">$120.00 · done</span></div>
                                            <hr className="hairline" />
                                            <div style={{ display: "flex", justifyContent: "space-between" }} className="small"><span className="subdued">Chuka Eze</span><span className="money">$2,400.00 · processing</span></div>
                                            <hr className="hairline" />
                                            <div style={{ display: "flex", justifyContent: "space-between" }} className="small"><span className="subdued">Amina Bello</span><span className="money" style={{ color: "var(--danger)" }}>$840.00 · failed</span></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="small" style={{ fontWeight: 500, marginBottom: "var(--sp-3)" }}>Send funds</div>
                                        <div className="field" style={{ marginBottom: "var(--sp-4)" }}>
                                            <span className="label">Beneficiary</span>
                                            <input className="input" value="Maya Kasim · 8842031169" readOnly />
                                        </div>
                                        <div className="field">
                                            <span className="label">Amount</span>
                                            <input className="input money" value="120.00" readOnly />
                                        </div>
                                        <div className="badge badge-success" style={{ marginTop: "var(--sp-4)" }}>Free transfer · instant</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 2 && (
                            <div className="product-frame">
                                <div style={{ padding: "var(--sp-8)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "var(--sp-6)" }}>
                                    <div className="card card-pad">
                                        <div className="small" style={{ fontWeight: 500 }}>Savings Vault</div>
                                        <div style={{ margin: "var(--sp-3) 0" }}><span className="money" style={{ fontSize: "1.5rem", fontWeight: 600 }}>$24,000</span> <span className="faint">/ $36,000</span></div>
                                        <div className="progress"><div className="progress-fill" style={{ width: "67%" }} /></div>
                                        <div className="xsmall faint" style={{ marginTop: "var(--sp-2)" }}>67% · auto-paused</div>
                                    </div>
                                    <div className="card card-pad">
                                        <div className="small" style={{ fontWeight: 500 }}>Emergency Fund</div>
                                        <div style={{ margin: "var(--sp-3) 0" }}><span className="money" style={{ fontSize: "1.5rem", fontWeight: 600 }}>$1,400</span> <span className="faint">/ $5,000</span></div>
                                        <div className="progress"><div className="progress-fill warning" style={{ width: "28%" }} /></div>
                                        <div className="xsmall faint" style={{ marginTop: "var(--sp-2)" }}>28% · round-ups on</div>
                                    </div>
                                    <div className="card card-pad">
                                        <div className="small" style={{ fontWeight: 500 }}>New goal</div>
                                        <div className="empty-state" style={{ padding: "var(--sp-6) 0 0" }}>
                                            <Link to="/dashboard/savings/new" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>+ Create goal</Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 3 && (
                            <div className="product-frame">
                                <div style={{ padding: "var(--sp-8)" }}>
                                    <div className="small" style={{ fontWeight: 500, marginBottom: "var(--sp-3)" }}>Spend breakdown · September</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                                        {[
                                            ["Transfers", "52%", "$2,012.18", ""],
                                            ["Withdrawals", "24%", "$940.00", "success"],
                                            ["Savings", "18%", "$700.00", "warning"],
                                            ["Other", "6%", "$220.00", "text3"],
                                        ].map(([label, width, amount, variant]) => (
                                            <div key={label} style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)" }} className="small">
                                                <span style={{ width: "9rem" }}>{label}</span>
                                                <div className="progress" style={{ flex: 1 }}>
                                                    <div className={`progress-fill ${variant === "success" ? "success" : variant === "warning" ? "warning" : ""}`}
                                                         style={{ width, ...(variant === "text3" ? { background: "var(--text-3)" } : {}) }} />
                                                </div>
                                                <span className="money tabular" style={{ minWidth: "5rem", textAlign: "right" }}>{amount}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* ================= STATEMENT ================= */}
                <section className="section-tight">
                    <div className="container">
                        <Reveal style={{ maxWidth: "46rem", textAlign: "center" }}>
                            <h2 className="display" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)" }}>Live balance, vaults, and transfers in a single clean view. <span className="display-accent">No clutter, no noise.</span></h2>
                        </Reveal>
                    </div>
                </section>

                {/* ================= FAQ ================= */}
                <section className="section" id="faq">
                    <div className="container" style={{ maxWidth: "46rem" }}>
                        <Reveal style={{ marginBottom: "var(--sp-6)" }}>
                            <span className="eyebrow">FAQ</span>
                            <h2 className="h2" style={{ marginTop: "var(--sp-3)" }}>Questions, answered.</h2>
                        </Reveal>
                        <div>
                            {faqs.map(([q, a], i) => (
                                <div key={q} className={`faq-item ${openFaq === i ? "open" : ""}`}>
                                    <button type="button" className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                                        {q}
                                        <svg className="faq-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                                    </button>
                                    <div className="faq-a"><p>{a}</p></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ================= FINAL CTA ================= */}
                <section className="section" style={{ paddingTop: 0 }}>
                    <div className="container">
                        <Reveal style={{ maxWidth: "50rem", textAlign: "center" }}>
                            <h2 className="h2" style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}>Banking that feels effortless.</h2>
                            <p className="lead" style={{ margin: "var(--sp-4) auto 0", maxWidth: "40ch" }}>Open a free account in minutes. Fund instantly. Spend and save smarter.</p>
                            <div style={{ display: "flex", gap: "var(--sp-3)", justifyContent: "center", marginTop: "var(--sp-8)", flexWrap: "wrap" }}>
                                <Link to="/signup" className="btn btn-primary btn-lg" style={{ textDecoration: "none" }}>Create Account</Link>
                                <Link to="/login" className="btn btn-secondary btn-lg" style={{ textDecoration: "none" }}>Sign In</Link>
                            </div>
                            <div className="xsmall mono faint" style={{ marginTop: "var(--sp-6)" }}>No monthly fees · Cancel anytime</div>
                        </Reveal>
                    </div>
                </section>
            </main>

            {/* ================= FOOTER ================= */}
            <footer className="footer-dark" style={{ marginTop: "var(--sp-16)" }}>
                <div className="container" style={{ paddingTop: "var(--sp-12)", paddingBottom: "var(--sp-12)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(3,1fr)", gap: "var(--sp-10)" }}>
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--accent)" />
                                    <path d="M5 16V8l7 6 7-6v8" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span style={{ color: "#fff", fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.03em" }}>Mova</span>
                            </div>
                            <p className="xsmall" style={{ color: "#6a6a76", marginTop: "var(--sp-3)", maxWidth: "28ch" }}>Digital finance for people who move. Fund, transfer, save, and track from one place.</p>
                        </div>
                        {[
                            ["Product", [["Features", "#features"], ["Savings", "/dashboard/savings"], ["Transactions", "/dashboard/transactions"]]],
                            ["Company", [["About", "#"], ["Careers", "#"], ["Press", "#"]]],
                            ["Legal", [["Privacy", "#"], ["Terms", "#"], ["Security", "#"]]],
                        ].map(([group, links]) => (
                            <div key={group as string}>
                                <div className="xsmall mono" style={{ color: "#6a6a76", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "var(--sp-4)" }}>{group}</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }} className="small">
                                    {(links as Array<[string, string]>).map(([label, to]) => (
                                        <a key={label} href={to} style={{ textDecoration: "none" }}>{label}</a>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <hr className="hairline" style={{ borderColor: "rgba(255,255,255,0.09)", margin: "var(--sp-10) 0 var(--sp-6)" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--sp-4)" }} className="xsmall">
                        <span style={{ color: "#6a6a76" }}>© 2026 Mova Technologies Ltd</span>
                        <span style={{ color: "#6a6a76" }}>Payments handled by licensed partners</span>
                    </div>
                </div>
            </footer>
        </>
    );
};

export default Index;