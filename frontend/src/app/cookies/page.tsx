import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "ChiselPost Cookie Policy — what cookies we use and why.",
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-slate-900 dark:text-white">ChiselPost</Link>
          <span className="text-sm text-slate-500">Last updated: 11 April 2026</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">Cookie Policy</h1>
        <p className="text-slate-500 mb-12 text-lg">
          This Cookie Policy explains how ChiselPost uses cookies and similar tracking technologies when you visit our website or use our platform.
        </p>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-10">

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">1. What Are Cookies?</h2>
            <p className="text-slate-600 dark:text-slate-400">
              Cookies are small text files placed on your device by websites you visit. They are widely used to make websites work efficiently, remember your preferences, and provide information to site owners. Similar technologies include local storage, session storage, and pixels.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">2. Cookies We Use</h2>

            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3">2.1 Strictly Necessary Cookies</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-3">These cookies are essential for the platform to function. They cannot be disabled.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Cookie</th>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Purpose</th>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr>
                    <td className="p-3 text-slate-600 dark:text-slate-400 font-mono">auth_token</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Maintains your authenticated session</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Session / 30 days</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-600 dark:text-slate-400 font-mono">csrf_token</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Prevents cross-site request forgery attacks</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Session</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-600 dark:text-slate-400 font-mono">workspace_id</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Remembers your currently selected workspace</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">30 days</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-8 mb-3">2.2 Preference Cookies</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-3">These cookies remember your settings and preferences to provide a personalised experience.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Cookie</th>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Purpose</th>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr>
                    <td className="p-3 text-slate-600 dark:text-slate-400 font-mono">theme</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Stores your dark/light mode preference</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">1 year</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-600 dark:text-slate-400 font-mono">locale</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Stores your language preference</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">1 year</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-slate-600 dark:text-slate-400 font-mono">sidebar_state</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Remembers whether the sidebar is open or collapsed</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">1 year</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-8 mb-3">2.3 Analytics Cookies</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-3">These cookies help us understand how our platform is used so we can improve it. They collect anonymised data.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Provider</th>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Purpose</th>
                    <th className="text-left p-3 text-slate-700 dark:text-slate-300 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Vercel Analytics</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Page views and performance metrics (privacy-first, no cross-site tracking)</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">3. How to Control Cookies</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              You can control and manage cookies in several ways:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li><strong>Browser settings:</strong> most browsers allow you to block or delete cookies via their privacy settings. Note that disabling strictly necessary cookies will prevent the platform from functioning.</li>
              <li><strong>Browser links:</strong>{" "}
                <a href="https://support.google.com/chrome/answer/95647" className="text-violet-600 hover:underline" target="_blank" rel="noopener noreferrer">Chrome</a>,{" "}
                <a href="https://support.mozilla.org/en-US/kb/enable-and-disable-cookies-website-preferences" className="text-violet-600 hover:underline" target="_blank" rel="noopener noreferrer">Firefox</a>,{" "}
                <a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" className="text-violet-600 hover:underline" target="_blank" rel="noopener noreferrer">Safari</a>,{" "}
                <a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" className="text-violet-600 hover:underline" target="_blank" rel="noopener noreferrer">Edge</a>.
              </li>
              <li><strong>Opt-out tools:</strong> for analytics, you can use browser extensions such as uBlock Origin or enable "Do Not Track" in your browser settings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">4. Updates to This Policy</h2>
            <p className="text-slate-600 dark:text-slate-400">
              We may update this Cookie Policy from time to time. Changes will be posted on this page with a revised "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">5. Contact</h2>
            <p className="text-slate-600 dark:text-slate-400">
              Questions about our use of cookies? Email us at <a href="mailto:privacy@chiselpost.com" className="text-violet-600 hover:underline">privacy@chiselpost.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-6 text-sm text-slate-500">
          <Link href="/privacy" className="hover:text-slate-800 dark:hover:text-white">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-800 dark:hover:text-white">Terms of Service</Link>
          <Link href="/security" className="hover:text-slate-800 dark:hover:text-white">Security</Link>
        </div>
      </main>
    </div>
  );
}
