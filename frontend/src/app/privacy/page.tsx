import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "ChiselPost Privacy Policy — how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Nav */}
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-slate-900 dark:text-white">
            ChiselPost
          </Link>
          <span className="text-sm text-slate-500">Last updated: 11 April 2026</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">Privacy Policy</h1>
        <p className="text-slate-500 mb-12 text-lg">
          This Privacy Policy describes how ChiselPost ("we", "us", or "our") collects, uses, and shares information about you when you use our services.
        </p>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-10">

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">1. Information We Collect</h2>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">1.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Account information:</strong> name, email address, password, and profile photo when you register.</li>
              <li><strong>Billing information:</strong> payment card details (processed and stored securely by our payment processor, Stripe — we never store raw card data).</li>
              <li><strong>Social media credentials:</strong> OAuth tokens for platforms you connect (Twitter/X, TikTok, YouTube, Pinterest, Instagram, LinkedIn, Facebook, Threads, Bluesky). We store only encrypted access tokens — never your passwords.</li>
              <li><strong>Content:</strong> posts, captions, images, and media you create or schedule through ChiselPost.</li>
              <li><strong>Communications:</strong> messages you send to our support team.</li>
            </ul>

            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">1.2 Information We Collect Automatically</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Usage data:</strong> pages visited, features used, actions taken, and time spent within the platform.</li>
              <li><strong>Device & log data:</strong> IP address, browser type, operating system, referring URLs, and crash reports.</li>
              <li><strong>Cookies & similar technologies:</strong> session cookies, preference cookies, and analytics identifiers. See our <Link href="/cookies" className="text-violet-600 hover:underline">Cookie Policy</Link> for full details.</li>
            </ul>

            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">1.3 Information From Third Parties</h3>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>Analytics data from connected social platforms (e.g., impressions, reach, follower counts) fetched via their APIs on your behalf.</li>
              <li>Payment status and fraud signals from Stripe.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">2. How We Use Your Information</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>Provide, maintain, and improve our services.</li>
              <li>Publish and schedule content to your connected social media accounts.</li>
              <li>Process payments and manage subscriptions.</li>
              <li>Send transactional emails (account confirmations, password resets, billing receipts).</li>
              <li>Send product updates and marketing communications (you can opt out at any time).</li>
              <li>Detect, investigate, and prevent fraud, abuse, and security incidents.</li>
              <li>Comply with legal obligations.</li>
              <li>Respond to your support requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">3. Legal Basis for Processing (EEA/UK Users)</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">If you are located in the European Economic Area or United Kingdom, we process your personal data under the following legal bases:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Contract performance:</strong> processing necessary to provide the services you have signed up for.</li>
              <li><strong>Legitimate interests:</strong> security, fraud prevention, and improving our services.</li>
              <li><strong>Consent:</strong> marketing communications and non-essential cookies (which you can withdraw at any time).</li>
              <li><strong>Legal obligation:</strong> compliance with applicable laws.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">4. How We Share Your Information</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">We do not sell your personal data. We share it only in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Service providers:</strong> trusted third parties who help us operate our platform (Stripe for payments, Resend for email, Cloudflare R2 for media storage, Render for hosting). These providers are contractually bound to protect your data.</li>
              <li><strong>Social media platforms:</strong> content you schedule is published via official platform APIs on your behalf.</li>
              <li><strong>Legal requirements:</strong> when required by law, court order, or governmental authority.</li>
              <li><strong>Business transfers:</strong> in connection with a merger, acquisition, or sale of assets, in which case users will be notified.</li>
              <li><strong>With your consent:</strong> for any other purpose disclosed to you at the time of collection.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">5. Data Retention</h2>
            <p className="text-slate-600 dark:text-slate-400">
              We retain your personal data for as long as your account is active or as needed to provide services. If you delete your account, we will delete or anonymise your personal data within 30 days, except where we are required to retain it for legal, tax, or compliance purposes (typically up to 7 years for financial records).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">6. International Data Transfers</h2>
            <p className="text-slate-600 dark:text-slate-400">
              ChiselPost is operated from the United Kingdom. Your data may be processed in countries outside your own, including the United States. Where we transfer data outside the EEA/UK, we ensure appropriate safeguards are in place (such as Standard Contractual Clauses or adequacy decisions).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">7. Your Rights</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">Depending on your location, you may have the following rights:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Access:</strong> request a copy of the personal data we hold about you.</li>
              <li><strong>Correction:</strong> request correction of inaccurate data.</li>
              <li><strong>Erasure:</strong> request deletion of your personal data ("right to be forgotten").</li>
              <li><strong>Portability:</strong> receive your data in a structured, machine-readable format.</li>
              <li><strong>Objection:</strong> object to processing based on legitimate interests or for direct marketing.</li>
              <li><strong>Restriction:</strong> request restriction of processing in certain circumstances.</li>
              <li><strong>Withdraw consent:</strong> where processing is based on consent, withdraw it at any time.</li>
            </ul>
            <p className="text-slate-600 dark:text-slate-400 mt-4">
              To exercise any of these rights, email us at <a href="mailto:privacy@chiselpost.com" className="text-violet-600 hover:underline">privacy@chiselpost.com</a>. We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">8. Security</h2>
            <p className="text-slate-600 dark:text-slate-400">
              We implement industry-standard security measures including TLS encryption in transit, AES-256 encryption at rest for sensitive tokens, bcrypt password hashing, and regular security audits. See our <Link href="/security" className="text-violet-600 hover:underline">Security page</Link> for full details. No method of transmission over the Internet is 100% secure, however, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">9. Children's Privacy</h2>
            <p className="text-slate-600 dark:text-slate-400">
              ChiselPost is not directed to children under the age of 16. We do not knowingly collect personal data from children. If you believe we have inadvertently collected data from a child, please contact us at <a href="mailto:privacy@chiselpost.com" className="text-violet-600 hover:underline">privacy@chiselpost.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">10. Changes to This Policy</h2>
            <p className="text-slate-600 dark:text-slate-400">
              We may update this Privacy Policy from time to time. We will notify you of significant changes via email or a prominent notice within the platform. The "Last updated" date at the top of this page indicates when this policy was last revised.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">11. Contact Us</h2>
            <div className="text-slate-600 dark:text-slate-400 space-y-1">
              <p><strong className="text-slate-800 dark:text-slate-200">ChiselPost</strong></p>
              <p>Data Controller</p>
              <p>Email: <a href="mailto:privacy@chiselpost.com" className="text-violet-600 hover:underline">privacy@chiselpost.com</a></p>
              <p>Website: <a href="https://chiselpost.com" className="text-violet-600 hover:underline">https://chiselpost.com</a></p>
            </div>
          </section>
        </div>

        {/* Footer nav */}
        <div className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-6 text-sm text-slate-500">
          <Link href="/terms" className="hover:text-slate-800 dark:hover:text-white">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-slate-800 dark:hover:text-white">Cookie Policy</Link>
          <Link href="/security" className="hover:text-slate-800 dark:hover:text-white">Security</Link>
        </div>
      </main>
    </div>
  );
}
