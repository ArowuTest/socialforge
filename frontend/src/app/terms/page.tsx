import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "ChiselPost Terms of Service — the rules governing your use of our platform.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl text-slate-900 dark:text-white">ChiselPost</Link>
          <span className="text-sm text-slate-500">Last updated: 11 April 2026</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">Terms of Service</h1>
        <p className="text-slate-500 mb-12 text-lg">
          Please read these Terms of Service carefully before using ChiselPost. By accessing or using our platform, you agree to be bound by these terms.
        </p>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-10">

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-600 dark:text-slate-400">
              These Terms of Service ("Terms") constitute a legally binding agreement between you and ChiselPost ("Company", "we", "us", or "our") governing your use of the ChiselPost website, platform, and related services (collectively, the "Service"). By creating an account or using the Service, you confirm that you are at least 16 years old and have the legal capacity to enter into this agreement.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">2. Description of Service</h2>
            <p className="text-slate-600 dark:text-slate-400">
              ChiselPost is a social media management platform that enables users and agencies to schedule, publish, analyse, and manage content across multiple social media platforms including Twitter/X, TikTok, YouTube, Pinterest, Instagram, LinkedIn, Facebook, Threads, and Bluesky. We may add, modify, or remove features at any time with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">3. Accounts and Registration</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>You must provide accurate, current, and complete information when creating an account.</li>
              <li>You are responsible for maintaining the confidentiality of your password and for all activities that occur under your account.</li>
              <li>You must notify us immediately at <a href="mailto:support@chiselpost.com" className="text-violet-600 hover:underline">support@chiselpost.com</a> if you suspect unauthorised access to your account.</li>
              <li>You may not share account credentials or allow others to access your account.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">4. Subscriptions and Billing</h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>Paid plans are billed in advance on a monthly or annual basis as selected at checkout.</li>
              <li>All fees are non-refundable except as required by law or expressly stated in our refund policy.</li>
              <li>We reserve the right to change pricing with 30 days' advance notice. Continued use after a price change constitutes acceptance.</li>
              <li>Failure to pay may result in suspension or termination of your account.</li>
              <li>AI credits purchased are non-refundable and expire at the end of each billing cycle unless otherwise stated.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">5. Acceptable Use</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">You agree not to use ChiselPost to:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-400">
              <li>Post or distribute content that is unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable.</li>
              <li>Violate any third-party platform's terms of service (including but not limited to Twitter/X, TikTok, Google, Pinterest).</li>
              <li>Spam, scrape, or harvest data from social platforms or ChiselPost itself.</li>
              <li>Attempt to gain unauthorised access to our systems or other users' accounts.</li>
              <li>Use the Service for any illegal purpose or in violation of any applicable laws or regulations.</li>
              <li>Reverse engineer, decompile, or otherwise attempt to extract source code from the Service.</li>
              <li>Resell or sublicense access to the Service without our express written permission.</li>
              <li>Use automated bots, scripts, or other tools to interact with social platforms in ways that violate those platforms' terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">6. Your Content</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              You retain ownership of all content you create and publish through ChiselPost. By using our Service, you grant us a limited, non-exclusive, worldwide, royalty-free licence to store, process, and transmit your content solely to the extent necessary to provide the Service.
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              You are solely responsible for ensuring that your content does not infringe any third-party intellectual property rights and complies with all applicable laws and the terms of the social platforms to which it is published.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">7. Intellectual Property</h2>
            <p className="text-slate-600 dark:text-slate-400">
              All elements of the ChiselPost platform — including the software, design, logos, trademarks, and documentation — are owned by or licensed to us and protected by intellectual property laws. You may not use our branding or intellectual property without our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">8. Third-Party Integrations</h2>
            <p className="text-slate-600 dark:text-slate-400">
              ChiselPost integrates with third-party social media platforms via their official APIs. We are not responsible for changes to third-party APIs, platform terms, or the availability of those platforms. Your use of connected platforms is governed by their respective terms of service and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">9. Disclaimers and Limitation of Liability</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, CHISELPOST SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. OUR AGGREGATE LIABILITY TO YOU SHALL NOT EXCEED THE AMOUNTS PAID BY YOU TO US IN THE TWELVE MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">10. Indemnification</h2>
            <p className="text-slate-600 dark:text-slate-400">
              You agree to indemnify, defend, and hold harmless ChiselPost and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising out of your use of the Service, your content, or your violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">11. Termination</h2>
            <p className="text-slate-600 dark:text-slate-400">
              You may cancel your account at any time from your account settings. We may suspend or terminate your account immediately if you violate these Terms or engage in conduct we determine, at our sole discretion, is harmful to the Service or other users. Upon termination, your right to use the Service ceases immediately and we will delete your data in accordance with our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">12. Governing Law and Disputes</h2>
            <p className="text-slate-600 dark:text-slate-400">
              These Terms shall be governed by and construed in accordance with the laws of England and Wales. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of England and Wales, unless you are a consumer in a jurisdiction with mandatory local law protections.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">13. Changes to These Terms</h2>
            <p className="text-slate-600 dark:text-slate-400">
              We may modify these Terms at any time. We will provide at least 30 days' notice of material changes via email or an in-app notification. Continued use of the Service after the effective date constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-4">14. Contact</h2>
            <div className="text-slate-600 dark:text-slate-400 space-y-1">
              <p>For questions about these Terms, contact us at:</p>
              <p>Email: <a href="mailto:legal@chiselpost.com" className="text-violet-600 hover:underline">legal@chiselpost.com</a></p>
              <p>Website: <a href="https://chiselpost.com" className="text-violet-600 hover:underline">https://chiselpost.com</a></p>
            </div>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-6 text-sm text-slate-500">
          <Link href="/privacy" className="hover:text-slate-800 dark:hover:text-white">Privacy Policy</Link>
          <Link href="/cookies" className="hover:text-slate-800 dark:hover:text-white">Cookie Policy</Link>
          <Link href="/security" className="hover:text-slate-800 dark:hover:text-white">Security</Link>
        </div>
      </main>
    </div>
  );
}
