import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Security",
  description: "ChiselPost Security — how we protect your data and keep your account safe.",
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-slate-900 dark:text-white">ChiselPost</Link>
          <span className="text-sm text-slate-500">Last updated: 11 April 2026</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">Security</h1>
        <p className="text-slate-500 mb-12 text-lg">
          Security is foundational to ChiselPost. This page describes the measures we take to protect your data, your accounts, and our platform.
        </p>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-10">

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">1. Data Encryption</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>In transit:</strong> All data transmitted between your browser and our servers is encrypted using TLS 1.2 or higher. We enforce HTTPS across all endpoints.</li>
              <li><strong>At rest:</strong> Sensitive data — including OAuth access tokens for connected social media accounts — is encrypted at rest using AES-256.</li>
              <li><strong>Passwords:</strong> User passwords are hashed using bcrypt with a high work factor. We never store plaintext passwords.</li>
              <li><strong>Payment data:</strong> We do not store payment card details. All billing is processed by Stripe, a PCI DSS Level 1 certified provider.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">2. Authentication and Access Control</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Session management:</strong> Authenticated sessions are managed using short-lived, cryptographically signed tokens. Sessions expire automatically after a period of inactivity.</li>
              <li><strong>CSRF protection:</strong> Cross-site request forgery protection is applied to all state-changing operations.</li>
              <li><strong>Role-based access:</strong> Access to workspace resources is controlled by a role system (owner, admin, member). Users can only access data within their own workspaces.</li>
              <li><strong>OAuth integrations:</strong> We connect to social media platforms using official OAuth 2.0 flows. We request only the minimum permissions necessary to provide the service.</li>
              <li><strong>Admin controls:</strong> Administrative functions are restricted to verified admin accounts and are not accessible from the public-facing application.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">3. Infrastructure Security</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Hosting:</strong> Our backend services are hosted on Render, and our frontend is deployed on Vercel — both of which operate on hardened cloud infrastructure with network isolation and DDoS protection.</li>
              <li><strong>Media storage:</strong> User-uploaded media is stored in Cloudflare R2, which provides geo-distributed, encrypted object storage.</li>
              <li><strong>Database:</strong> Our databases are hosted on managed cloud infrastructure with encryption at rest, automated backups, and private networking. Direct public access to the database is disabled.</li>
              <li><strong>Environment isolation:</strong> Production, staging, and development environments are fully separated. Secrets and credentials are never stored in source code.</li>
              <li><strong>Dependency management:</strong> We regularly audit and update dependencies to patch known vulnerabilities.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">4. Application Security</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Input validation:</strong> All user inputs are validated and sanitised on both the client and server side to prevent injection attacks.</li>
              <li><strong>Rate limiting:</strong> API endpoints are rate-limited to prevent brute-force and denial-of-service attacks.</li>
              <li><strong>Security headers:</strong> We apply standard HTTP security headers including Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy.</li>
              <li><strong>Audit logging:</strong> Sensitive actions (login attempts, account changes, connected account modifications) are logged for security auditing purposes.</li>
              <li><strong>Third-party APIs:</strong> We interact with social media platform APIs only over HTTPS and store resulting tokens in encrypted form.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">5. Protecting Your Account</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">There are steps you can take to keep your ChiselPost account secure:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>Use a strong, unique password that you do not reuse on other services.</li>
              <li>Do not share your login credentials with anyone, including team members — use the workspace invitation system instead.</li>
              <li>Log out of ChiselPost when using shared or public devices.</li>
              <li>Be alert to phishing emails. We will never ask for your password via email.</li>
              <li>Review connected social accounts regularly and revoke any that you no longer use.</li>
              <li>Contact us immediately if you suspect your account has been compromised.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">6. Data Handling and Retention</h2>
            <p className="text-slate-600 dark:text-slate-400">
              We follow the principle of data minimisation — collecting only what is necessary to provide the service. When you delete your account, your personal data is deleted or anonymised within 30 days, except where we are required to retain it for legal or financial compliance purposes. See our <Link href="/privacy" className="text-violet-600 hover:underline">Privacy Policy</Link> for full details.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">7. Security Monitoring and Incident Response</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>We monitor our systems continuously for anomalous activity, unauthorised access attempts, and infrastructure health.</li>
              <li>In the event of a confirmed security incident, we will notify affected users promptly, in accordance with applicable data protection laws (including UK GDPR where applicable).</li>
              <li>We maintain an incident response process that includes containment, investigation, remediation, and post-incident review.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">8. Vulnerability Disclosure</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              We take security reports seriously. If you believe you have discovered a security vulnerability in ChiselPost, please disclose it to us responsibly:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>Email us at <a href="mailto:security@chiselpost.com" className="text-violet-600 hover:underline">security@chiselpost.com</a> with a description of the issue.</li>
              <li>Include steps to reproduce, potential impact, and any supporting evidence (screenshots, request/response logs).</li>
              <li>We ask that you do not publicly disclose the issue until we have had a reasonable opportunity to investigate and remediate it.</li>
              <li>We do not currently operate a formal bug bounty programme, but we do acknowledge responsible disclosure and will respond promptly.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">9. Compliance</h2>
            <p className="text-slate-600 dark:text-slate-400">
              ChiselPost is operated from the United Kingdom and we are committed to compliance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018. Our payment processing is handled by Stripe, which is PCI DSS Level 1 certified. We review our security practices regularly and update them as the threat landscape and regulatory requirements evolve.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">10. Contact</h2>
            <p className="text-slate-600 dark:text-slate-400">
              For security concerns or questions, contact us at <a href="mailto:security@chiselpost.com" className="text-violet-600 hover:underline">security@chiselpost.com</a>. For general privacy queries, see our <Link href="/privacy" className="text-violet-600 hover:underline">Privacy Policy</Link>.
            </p>
          </section>

        </div>

        <div className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-6 text-sm text-slate-500">
          <Link href="/privacy" className="hover:text-slate-800 dark:hover:text-white">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-800 dark:hover:text-white">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-slate-800 dark:hover:text-white">Cookie Policy</Link>
        </div>
      </main>
    </div>
  );
}
