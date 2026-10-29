/**
 * Donations (owner decision 2026-10-29): Stripe Payment Links, opened in a new tab. The site never
 * handles payments: no card data, no Stripe script, no cookie. The links are public URLs set at build
 * time (Vercel environment variables), so changing them needs no code:
 *   VITE_STRIPE_DONATE_URL          one-off donation (customer chooses the amount)
 *   VITE_STRIPE_DONATE_MONTHLY_URL  monthly support (optional)
 *   VITE_STRIPE_PORTAL_URL          Stripe customer portal, to stop or change a monthly support (optional)
 */

import { stripeLink } from './stripeLink.ts';

export const DONATE = {
  once: stripeLink(import.meta.env.VITE_STRIPE_DONATE_URL),
  monthly: stripeLink(import.meta.env.VITE_STRIPE_DONATE_MONTHLY_URL),
  portal: stripeLink(import.meta.env.VITE_STRIPE_PORTAL_URL),
};
export const donationsOpen = !!(DONATE.once || DONATE.monthly);
